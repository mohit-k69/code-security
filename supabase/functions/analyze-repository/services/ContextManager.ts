import { ProviderService } from "./ProviderService.ts";
import { DependencyResolver } from "./DependencyResolver.ts";
import { ContextPackage, ContextFile, DependencyFile, PipelineError } from "./types.ts";

// Re-export for backward compatibility
export type { ContextPackage } from "./types.ts";

// ─── File-Type Configuration ─────────────────────────────────────
// Consolidated into Sets for clean O(1) lookups.

const EXCLUDED_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',   // Images
  '.pdf', '.doc', '.docx',                                     // Documents
  '.md',                                                        // Markdown/docs
  '.json', '.yaml', '.yml', '.toml',                           // Config (not code)
  '.lock', '.sum',                                              // Lockfiles
  '.woff', '.woff2', '.ttf', '.eot',                           // Fonts
  '.mp3', '.mp4', '.wav', '.avi',                              // Media
  '.zip', '.tar', '.gz',                                        // Archives
]);

const SUPPORTED_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx',      // JavaScript/TypeScript
  '.py',                              // Python
  '.go',                              // Go
  '.java',                            // Java
  '.c', '.cpp', '.h', '.hpp',        // C/C++
  '.cs',                              // C#
  '.rb',                              // Ruby
  '.php',                             // PHP
]);

// ─── Context Manager ─────────────────────────────────────────────

export class ContextManager {
  private provider: ProviderService;
  private resolver: DependencyResolver;
  
  // Configurable constant for context limits
  private readonly CONTEXT_MAX_SIZE = 200000;

  constructor(provider: ProviderService, resolver: DependencyResolver) {
    this.provider = provider;
    this.resolver = resolver;
  }

  public async buildContext(owner: string, repo: string, prNumber: number, commitSha: string): Promise<ContextPackage | PipelineError> {
    try {
      // 1. Fetch changed files
      const prFiles = await this.provider.getChangedFiles(owner, repo, prNumber);
      
      if (!prFiles || prFiles.length === 0) {
        return { stage: 'context_manager', message: 'No changed files available for analysis.', fatal: false };
      }

      let currentChars = 0;
      let truncated = false;
      const changedFiles: ContextFile[] = [];
      const dependencies: DependencyFile[] = [];
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

        // Attempt to fetch dependency with extension fallback
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

      if (changedFiles.length === 0) {
        return { stage: 'context_manager', message: 'No supported source files were available for security analysis.', fatal: false };
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
      return { stage: 'context_manager', message: 'Failed to build context package.', fatal: true };
    }
  }

  private isSupportedFile(filename: string): boolean {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return false;

    const ext = filename.substring(lastDot).toLowerCase();
    if (EXCLUDED_EXTS.has(ext)) return false;
    return SUPPORTED_EXTS.has(ext);
  }

  private async fetchDependencyWithFallback(owner: string, repo: string, basePath: string, commitSha: string): Promise<{ path: string; content: string } | null> {
    const extensionsToTry = ['', '.ts', '.tsx', '.js', '.jsx', '.py', '/index.ts', '/index.js'];
    
    for (const ext of extensionsToTry) {
      const tryPath = basePath + ext;
      try {
        const content = await this.provider.getFileContent(owner, repo, tryPath, commitSha);
        return { path: tryPath, content };
      } catch (_err) {
        // Ignored, try next extension
      }
    }
    return null; // All attempts failed
  }
}
