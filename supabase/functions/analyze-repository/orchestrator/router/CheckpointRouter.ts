// ─── Rule-Based Router ──────────────────────────────────────────
// Deterministic, LLM-free checkpoint selection engine.
//
// Examines changed file paths against a configurable routing table.
// Produces a RoutingDecision containing selected checkpoints,
// skipped checkpoints, and a human-readable explanation.
//
// Fail-open policy: if no rules match, ALL checkpoints execute.

import type { RoutingRule, RoutingDecision } from "./types.ts";
import type { ILLMProvider } from "../providers/ILLMProvider.ts";
import { DEFAULT_ROUTING_RULES } from "./defaultRoutingRules.ts";

export class CheckpointRouter {
  private rules: RoutingRule[];
  private allCheckpointIds: string[];
  private provider?: ILLMProvider;

  /**
   * @param allCheckpointIds All enabled checkpoint IDs from the registry.
   * @param rules            Optional custom routing rules. Defaults to the
   *                         standard routing configuration.
   * @param provider         Optional ILLMProvider for Tier-2 semantic routing
   */
  constructor(allCheckpointIds: string[], rules?: RoutingRule[], provider?: ILLMProvider) {
    this.allCheckpointIds = allCheckpointIds;
    this.rules = rules ?? DEFAULT_ROUTING_RULES;
    this.provider = provider;
  }

  /**
   * Determine which checkpoints should execute for the given changed files.
   *
   * @param routingInputs Array of file paths from the PR diff, or snippet contents if Paste Code.
   * @param isPasteCode Whether we are routing for a Paste Code snippet.
   * @returns A deterministic RoutingDecision.
   */
  public async route(routingInputs: string[], isPasteCode: boolean = false): Promise<RoutingDecision> {
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
    // Empty for Paste Code: invoke Tier-2 semantic router if Tier-1 finds no keywords
    if (selectedIds.size === 0) {
      if (isPasteCode) {
        const snippet = routingInputs.join("\\n");
        const tier2Ids = await this.invokeTier2Classifier(snippet);
        const validTier2 = tier2Ids.filter(id => this.allCheckpointIds.includes(id));
        
        if (validTier2.length > 0) {
          validTier2.forEach(id => selectedIds.add(id));
          explanation.push(`Tier-1 returned 0 checkpoints. Tier-2 Semantic Classifier identified: ${validTier2.join(", ")}`);
        } else {
          return {
            selectedCheckpointIds: [],
            skippedCheckpointIds: this.allCheckpointIds,
            isFallback: true,
            explanation: ["No security-sensitive keywords detected in code snippet. Skipping domain-specific checkpoints."]
          };
        }
      } else {
        return this.buildFallbackDecision(
          `No routing rules matched for files: ${loweredInputs.slice(0, 5).join(", ")}${loweredInputs.length > 5 ? " ..." : ""}. Executing all checkpoints (fail-open).`
        );
      }
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

  private async invokeTier2Classifier(snippet: string): Promise<string[]> {
    if (!this.provider) return [];

    const systemPrompt = `You are a code security routing classifier.
Your objective is to read a code snippet and determine if it contains logic that warrants deep security evaluation.
Select the appropriate security checkpoint IDs based on the snippet's semantic behavior.

Critical Rules:
1. Prioritize high recall for security-relevant domains (e.g., custom authentication, file serving, data access).
2. Explicitly identify business-logic authorization (e.g., paymentGateway.charge, user roles, permission checks) as SEC-AUTHZ-001.
3. Avoid unnecessary checkpoint selection. Treat related domains as optional unless there is concrete evidence they are relevant in the snippet.
4. You MUST return a JSON object exactly matching this schema: { "checkpoints": ["ID1", "ID2"] }.
5. For genuinely benign code, you MUST return { "checkpoints": [] } to save costs. Benign code includes: standard UI components, CSS/styling, basic math, public keys (e.g., Stripe public keys), mock data, or generic boilerplate.
6. Do not select SEC-SECRET-001 for explicitly public constants, IDs, or mock examples.
7. ONLY select checkpoints from this exact list:
"SEC-AUTH-001", "SEC-AUTHZ-001", "SEC-INPUT-001", "SEC-SECRET-001", "SEC-SESSION-001", "SEC-CRYPTO-001", "SEC-CONFIG-001", "SEC-XSS-001", "SEC-FILE-001", "SEC-SUPPLY-001"`;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Tier-2 LLM timeout")), 3000);
      });

      const response = await Promise.race([
        this.provider.generateContent(systemPrompt, `Snippet:\\n\\n${snippet}`, "openai/gpt-4o-mini"),
        timeoutPromise
      ]);

      let parsed;
      try {
        parsed = JSON.parse(response.text);
      } catch {
        return [];
      }

      if (Array.isArray(parsed)) {
        return parsed;
      }
      return Array.isArray(parsed?.checkpoints) ? parsed.checkpoints : [];
    } catch {
      return [];
    }
  }
}
