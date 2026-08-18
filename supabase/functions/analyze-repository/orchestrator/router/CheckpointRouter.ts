// ─── Rule-Based Router ──────────────────────────────────────────
// Deterministic, LLM-free checkpoint selection engine.
//
// Examines changed file paths against a configurable routing table.
// Produces a RoutingDecision containing selected checkpoints,
// skipped checkpoints, and a human-readable explanation.
//
// Fail-open policy: if no rules match, ALL checkpoints execute.

import type { RoutingRule, RoutingDecision } from "./types.ts";
import { DEFAULT_ROUTING_RULES } from "./defaultRoutingRules.ts";

export class CheckpointRouter {
  private rules: RoutingRule[];
  private allCheckpointIds: string[];

  /**
   * @param allCheckpointIds All enabled checkpoint IDs from the registry.
   * @param rules            Optional custom routing rules. Defaults to the
   *                         standard routing configuration.
   */
  constructor(allCheckpointIds: string[], rules?: RoutingRule[]) {
    this.allCheckpointIds = allCheckpointIds;
    this.rules = rules ?? DEFAULT_ROUTING_RULES;
  }

  /**
   * Determine which checkpoints should execute for the given changed files.
   *
   * @param changedFilePaths Array of file paths from the PR diff.
   * @returns A deterministic RoutingDecision.
   */
  public route(changedFilePaths: string[]): RoutingDecision {
    // Edge case: no changed files → fail open
    if (changedFilePaths.length === 0) {
      return this.buildFallbackDecision("No changed files detected. Executing all checkpoints (fail-open).");
    }

    const selectedIds = new Set<string>();
    const explanation: string[] = [];
    const matchedRuleNames: string[] = [];

    const loweredPaths = changedFilePaths.map((p) => p.toLowerCase());

    for (const rule of this.rules) {
      const matchedFiles: string[] = [];

      for (const filePath of loweredPaths) {
        for (const pattern of rule.matchPatterns) {
          if (filePath.includes(pattern.toLowerCase())) {
            matchedFiles.push(filePath);
            break; // one pattern match per file is sufficient
          }
        }
      }

      if (matchedFiles.length > 0) {
        for (const cpId of rule.checkpointIds) {
          selectedIds.add(cpId);
        }
        matchedRuleNames.push(rule.name);
        const truncatedFiles = matchedFiles.slice(0, 3);
        const suffix = matchedFiles.length > 3 ? ` (+${matchedFiles.length - 3} more)` : "";
        explanation.push(
          `Rule "${rule.name}" matched ${matchedFiles.length} file(s): ${truncatedFiles.join(", ")}${suffix} → ${rule.checkpointIds.join(", ")}`
        );
      }
    }

    // Fail open: if no rules matched, run everything
    if (selectedIds.size === 0) {
      return this.buildFallbackDecision(
        `No routing rules matched for files: ${loweredPaths.slice(0, 5).join(", ")}${loweredPaths.length > 5 ? " ..." : ""}. Executing all checkpoints (fail-open).`
      );
    }

    // Filter to only IDs that actually exist in the registry
    const validSelectedIds = [...selectedIds].filter((id) =>
      this.allCheckpointIds.includes(id)
    );

    const skippedIds = this.allCheckpointIds.filter(
      (id) => !validSelectedIds.includes(id)
    );

    explanation.push(
      `Selected ${validSelectedIds.length} checkpoint(s), skipped ${skippedIds.length}.`
    );

    return {
      selectedCheckpointIds: validSelectedIds,
      skippedCheckpointIds: skippedIds,
      isFallback: false,
      explanation,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────

  private buildFallbackDecision(reason: string): RoutingDecision {
    return {
      selectedCheckpointIds: [...this.allCheckpointIds],
      skippedCheckpointIds: [],
      isFallback: true,
      explanation: [reason],
    };
  }
}
