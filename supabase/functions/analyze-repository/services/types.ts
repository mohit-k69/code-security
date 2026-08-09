// ─── Shared Type Definitions ─────────────────────────────────────
// Central home for types consumed across multiple pipeline components.
// This breaks the tight coupling where security components previously
// imported from ContextManager.ts just for type definitions.

// ─── File Types ──────────────────────────────────────────────────

export interface ContextFile {
  path: string;
  content?: string;
  deleted: boolean;
}

export interface DependencyFile {
  path: string;
  content: string;
}

// ─── Context Package ─────────────────────────────────────────────

export interface ContextPackage {
  repository: string;
  prNumber: number;
  commitSha: string;
  changedFiles: ContextFile[];
  dependencies: DependencyFile[];
  missingDependencies: string[];
  metadata: {
    totalFiles: number;
    totalChars: number;
    truncated: boolean;
  };
}

// ─── Sanitized Context Package ───────────────────────────────────

export interface SanitizationMetadata {
  totalSecretsReplaced: number;
  replacementTypes: Record<string, number>;
  ignoredReplacements: number;
  processingTimeMs: number;
}

export interface SanitizedContextPackage {
  repository: string;
  prNumber: number;
  commitSha: string;
  changedFiles: ContextFile[];
  dependencies: DependencyFile[];
  metadata: SanitizationMetadata;
}

// ─── Pipeline Error ──────────────────────────────────────────────

export interface PipelineError {
  stage: string;
  message: string;
  fatal: boolean;
}

// ─── Utilities ───────────────────────────────────────────────────

/**
 * Generic grouping utility. Groups an array of items into a Map
 * keyed by the result of `keyFn`.
 */
export function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(item);
  }
  return map;
}
