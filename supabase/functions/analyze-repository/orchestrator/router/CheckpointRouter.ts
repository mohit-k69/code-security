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
   * @param routingInputs Array of file paths from the PR diff, or snippet contents if Paste Code.
   * @param isPasteCode Whether we are routing for a Paste Code snippet.
   * @returns A deterministic RoutingDecision.
   */
  public route(routingInputs: string[], isPasteCode: boolean = false): RoutingDecision {
    // Edge case: no inputs → fail open for GitHub, empty for Paste Code
    if (routingInputs.length === 0) {
      if (isPasteCode) {
        return {
          selectedCheckpointIds: [],
          skippedCheckpointIds: this.allCheckpointIds,
          isFallback: true,
          explanation: ["No code provided. Selected 0 checkpoints."]
        };
      }
      return this.buildFallbackDecision("No changed files detected. Executing all checkpoints (fail-open).");
    }

    const selectedIds = new Set<string>();
    const explanation: string[] = [];
    const matchedRuleNames: string[] = [];

    const loweredInputs = routingInputs.map((p) => p.toLowerCase());

    for (const rule of this.rules) {
      const matchedInputs: string[] = [];
      const patternsToUse = isPasteCode ? rule.contentMatchPatterns : rule.fileMatchPatterns;

      for (const input of loweredInputs) {
        // Strip JS comments so explanatory text doesn't trigger routing
        const contentToMatch = isPasteCode ? input.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "") : input;

        for (const pattern of patternsToUse) {
          if (contentToMatch.includes(pattern.toLowerCase())) {
            matchedInputs.push(input);
            break; // one pattern match per input is sufficient
          }
        }
      }

      if (matchedInputs.length > 0) {
        for (const cpId of rule.checkpointIds) {
          selectedIds.add(cpId);
        }
        matchedRuleNames.push(rule.name);
        const truncatedInputs = isPasteCode ? ["snippet code"] : matchedInputs.slice(0, 3);
        const suffix = (!isPasteCode && matchedInputs.length > 3) ? ` (+${matchedInputs.length - 3} more)` : "";
        explanation.push(
          `Rule "${rule.name}" matched ${isPasteCode ? "code content" : `${matchedInputs.length} file(s)`}: ${truncatedInputs.join(", ")}${suffix} → ${rule.checkpointIds.join(", ")}`
        );
      }
    }

    // Fail open for GitHub: if no rules matched, run everything
    // Empty for Paste Code: if no meaningful security domain signal is found, return empty set
    if (selectedIds.size === 0) {
      if (isPasteCode) {
        return {
          selectedCheckpointIds: [],
          skippedCheckpointIds: this.allCheckpointIds,
          isFallback: true,
          explanation: ["No security-sensitive keywords detected in code snippet. Skipping domain-specific checkpoints."]
        };
      }
      return this.buildFallbackDecision(
        `No routing rules matched for files: ${loweredInputs.slice(0, 5).join(", ")}${loweredInputs.length > 5 ? " ..." : ""}. Executing all checkpoints (fail-open).`
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
