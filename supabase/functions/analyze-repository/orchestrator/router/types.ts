// ─── Router Types ───────────────────────────────────────────────
// Data-driven routing configuration for checkpoint selection.
// No AI logic. No provider awareness. Pure pattern matching.

/**
 * A single routing rule mapping file patterns to checkpoint IDs.
 * When any pattern matches a changed file path, the associated
 * checkpoints are selected for execution.
 */
export interface RoutingRule {
  /** Human-readable name for debugging (e.g., "Authentication") */
  name: string;

  /**
   * Case-insensitive substrings or glob-style patterns to match
   * against changed file paths. A file matches if its lowercased
   * path contains any of these patterns.
   */
  matchPatterns: string[];

  /** Checkpoint IDs to execute when this rule matches */
  checkpointIds: string[];
}

/**
 * The output of the routing decision.
 */
export interface RoutingDecision {
  /** Checkpoint IDs selected for execution */
  selectedCheckpointIds: string[];

  /** Checkpoint IDs excluded from this run */
  skippedCheckpointIds: string[];

  /** Whether the router fell back to executing all checkpoints */
  isFallback: boolean;

  /** Human-readable, deterministic explanation of the routing decision */
  explanation: string[];
}
