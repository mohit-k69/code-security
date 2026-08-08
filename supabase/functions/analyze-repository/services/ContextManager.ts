import { ProviderService, PRFile } from "./ProviderService.ts";
import { DependencyResolver } from "./DependencyResolver.ts";

export interface ContextPackage {
  repository: string;
  prNumber: number;
  commitSha: string;
  changedFiles: { path: string; content?: string; deleted: boolean }[];
  dependencies: { path: string; content: string }[];
  missingDependencies: string[];
  metadata: {
    totalFiles: number;
    totalChars: number;
    truncated: boolean;
  };
}

export class ContextManager {
  private provider: ProviderService;
  private resolver: DependencyResolver;
  
  // Configurable constant for context limits
  private readonly CONTEXT_MAX_SIZE = 200000;
  
  // Supported file extensions for dependency fetching.
  // Rule 4: Ignore unrelated files (README, docs, images, assets, etc.)
  private readonly SUPPORTED_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php'];

  constructor(provider: ProviderService, resolver: DependencyResolver) {
    this.provider = provider;
    this.resolver = resolver;
  }

  public async buildContext(owner: string, repo: string, prNumber: number, commitSha: string): Promise<ContextPackage | { error: string }> {
    try {
      // 1. Fetch changed files
      const prFiles = await this.provider.getChangedFiles(owner, repo, prNumber);
      
      if (!prFiles || prFiles.length === 0) {
        return { error: 'No changed files available for analysis.' };
      }

      let currentChars = 0;
      let truncated = false;
      const changedFiles: { path: string; content?: string; deleted: boolean }[] = [];
      const dependencies: { path: string; content: string }[] = [];
      const missingDependencies: string[] = [];
      
      const visitedFiles = new Set<string>();
      const dependencyQueue: string[] = [];

      // Process changed files first (Priority)
      for (const file of prFiles) {
        visitedFiles.add(file.filename);
        
        // Edge Case: Deleted files -> Include deletion metadata only
        if (file.status === 'removed') {
          changedFiles.push({ path: file.filename, deleted: true });
          continue;
        }

        // Edge Case: Binary/Unsupported files -> Ignore
        if (!this.isSupportedFile(file.filename)) {
          continue;
        }

        // Fetch content
        try {
          const content = await this.provider.getFileContent(owner, repo, file.filename, commitSha);
          
          if (currentChars + content.length > this.CONTEXT_MAX_SIZE) {
            truncated = true;
            break; // Stop adding files if we hit the limit
          }

          changedFiles.push({ path: file.filename, content, deleted: false });
          currentChars += content.length;

          // Resolve dependencies to queue
          const deps = this.resolver.resolveDependencies(content, file.filename);
          for (const dep of deps) {
            if (!visitedFiles.has(dep)) {
              dependencyQueue.push(dep);
            }
          }
        } catch (err) {
          console.error(`Failed to fetch changed file: ${file.filename}`);
        }
      }

      // Process dependencies if limit not reached
      while (dependencyQueue.length > 0 && !truncated) {
        const depPath = dependencyQueue.shift()!;
        
        // Prevent circular dependencies (Rule Circular imports)
        if (visitedFiles.has(depPath)) continue;
        visitedFiles.add(depPath);

        // Attempt to fetch dependency. Since extensions might be missing in imports (e.g., './utils'),
        // we try common extensions if the exact path fails.
        const fileContent = await this.fetchDependencyWithFallback(owner, repo, depPath, commitSha);
        
        if (!fileContent) {
          missingDependencies.push(depPath);
          continue;
        }

        if (currentChars + fileContent.content.length > this.CONTEXT_MAX_SIZE) {
          truncated = true;
          break;
        }

        dependencies.push({ path: fileContent.path, content: fileContent.content });
        currentChars += fileContent.content.length;
        
        // Add its dependencies to the queue (recursive resolution)
        const nestedDeps = this.resolver.resolveDependencies(fileContent.content, fileContent.path);
        for (const nd of nestedDeps) {
          if (!visitedFiles.has(nd)) {
            dependencyQueue.push(nd);
          }
        }
      }

      return {
        repository: `${owner}/${repo}`,
        prNumber,
        commitSha,
        changedFiles,
        dependencies,
        missingDependencies,
        metadata: {
          totalFiles: changedFiles.length + dependencies.length,
          totalChars: currentChars,
          truncated
        }
      };

    } catch (err: any) {
      console.error('ContextManager Error:', err.message);
      return { error: 'Failed to build context package.' };
    }
  }

  private isSupportedFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    // Broad exclusion for binary/images/docs
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || 
        lower.endsWith('.gif') || lower.endsWith('.pdf') || lower.endsWith('.md') || 
        lower.endsWith('.json') || lower.endsWith('.lock') || lower.endsWith('.svg')) {
      return false;
    }
    // Only accept source code extensions
    return this.SUPPORTED_EXTS.some(ext => lower.endsWith(ext));
  }

  private async fetchDependencyWithFallback(owner: string, repo: string, basePath: string, commitSha: string): Promise<{ path: string; content: string } | null> {
    const extensionsToTry = ['', '.ts', '.tsx', '.js', '.jsx', '.py', '/index.ts', '/index.js'];
    
    for (const ext of extensionsToTry) {
      const tryPath = basePath + ext;
      try {
        const content = await this.provider.getFileContent(owner, repo, tryPath, commitSha);
        return { path: tryPath, content };
      } catch (err) {
        // Ignored, try next extension
      }
    }
    return null; // All attempts failed
  }
}
