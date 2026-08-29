export class DependencyResolver {
  /**
   * Parses the file content using RegEx to find local imports/requires.
   * Returns a list of absolute paths (relative to the repo root).
   * Note: The returned paths might lack extensions (e.g., .ts, .js), which the caller must handle.
   */
  public resolveDependencies(content: string, currentFilePath: string): string[] {
    const dependencies = new Set<string>();
    
    // RegEx to match `import ... from '...'` or `import '...'` or `require('...')`
    // We only care about local paths (starting with ./ or ../)
    const importRegex = /(?:import\s+.*?\s+from\s+|import\s+|require\s*\(\s*)['"](\.[^'"]+)['"]/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const relativePath = match[1];
      if (relativePath.startsWith('.')) {
        const absolutePath = this.resolvePath(currentFilePath, relativePath);
        dependencies.add(absolutePath);
      }
    }

    return Array.from(dependencies);
  }

  /**
   * Resolves a relative path against the current file's path.
   * Example: resolvePath('src/components/App.tsx', '../utils/helpers'] -> 'src/utils/helpers'
   */
  private resolvePath(currentFilePath: string, relativePath: string): string {
    const currentParts = currentFilePath.split('/');
    // Remove the file name itself to get the directory
    currentParts.pop();

    const relativeParts = relativePath.split('/');

    for (const part of relativeParts) {
      if (part === '.') {
        continue; // Current directory, do nothing
      } else if (part === '..') {
        if (currentParts.length > 0) {
          currentParts.pop(); // Go up one directory
        }
      } else {
        currentParts.push(part);
      }
    }

    return currentParts.join('/');
  }
}
