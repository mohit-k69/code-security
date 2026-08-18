// ─── Review Orchestrator ────────────────────────────────────────
// The single public entry point for repository security analysis.
//
// Coordinates the complete review pipeline:
//   SanitizedContextPackage
//     → Router (which checkpoints?)
//     → Registry (resolve implementations)
//     → CheckpointRunner (parallel execution via Promise.allSettled)
//     → FindingAggregator (deterministic dedup)
//     → ReportGenerator (final SecurityReport)
//
// Design invariants:
//   - No provider-specific logic (Gemini, OpenRouter, etc.)
//   - No security-analysis logic (XSS, Auth, etc.)
//   - Tolerates partial failures
//   - Individual checkpoint timeouts never cancel others

import type { SanitizedContextPackage } from "../services/types.ts";
import type { ILLMProvider, TokenUsage } from "./providers/ILLMProvider.ts";
import type { CheckpointResult } from "../services/CheckpointRunner.ts";
import type { RegisteredCheckpoint } from "./registry/types.ts";
import type { SecurityReport, RepositoryContext } from "./report/types.ts";
import type { RoutingRule } from "./router/types.ts";

import { CheckpointRunner } from "../services/CheckpointRunner.ts";
import { CheckpointRouter } from "./router/CheckpointRouter.ts";
import { FindingAggregator } from "./aggregator/FindingAggregator.ts";
import { ReportGenerator } from "./report/ReportGenerator.ts";
import { SECURITY_REVIEW_FRAMEWORK } from "../prompts/SecurityReviewFramework.ts";
import { getEnabledCheckpoints } from "./registry/CheckpointRegistry.ts";

export interface OrchestratorConfig {
  /** The LLM provider to use for all checkpoint executions */
  provider: ILLMProvider;

  /** Optional custom routing rules (defaults to the standard routing table) */
  routingRules?: RoutingRule[];
}

export interface PipelineMetrics {
  totalExecutionTimeMs: number;
  routerDecisions: {
    selectedCheckpoints: number;
    skippedCheckpoints: number;
  };
  totalTokenUsage: TokenUsage;
  rawFindingsCount: number;
  aggregatedFindingsCount: number;
  providerDurationMs: number;
}

export interface ReviewExecutionResult {
  report: SecurityReport;
  metrics?: PipelineMetrics;
}

export class ReviewOrchestrator {
  private provider: ILLMProvider;
  private aggregator: FindingAggregator;
  private reportGenerator: ReportGenerator;
  private routingRules?: RoutingRule[];

  constructor(config: OrchestratorConfig) {
    this.provider = config.provider;
    this.routingRules = config.routingRules;
    this.aggregator = new FindingAggregator();
    this.reportGenerator = new ReportGenerator();
  }

  /**
   * Execute a complete security review against a sanitized PR context.
   * This is the single public entry point for repository analysis.
   *
   * @param sanitizedPackage The sanitized context from the upstream pipeline.
   * @returns A complete ReviewExecutionResult containing the report and optional metrics.
   */
  public async review(sanitizedPackage: SanitizedContextPackage): Promise<ReviewExecutionResult> {
    const pipelineStartTime = performance.now();
    // 1. Resolve all enabled checkpoints from the registry
    const allCheckpoints = getEnabledCheckpoints();
    const allCheckpointIds = allCheckpoints.map((cp) => cp.id);

    // 2. Route: determine which checkpoints to run
    const changedFilePaths = sanitizedPackage.changedFiles.map((f) => f.path);
    const router = new CheckpointRouter(allCheckpointIds, this.routingRules);
    const routingDecision = router.route(changedFilePaths);

    // 3. Resolve selected checkpoint implementations
    const selectedCheckpoints = allCheckpoints.filter((cp) =>
      routingDecision.selectedCheckpointIds.includes(cp.id)
    );

    // 4. Execute selected checkpoints in parallel (tolerating failures)
    const results = await this.executeCheckpoints(
      selectedCheckpoints,
      sanitizedPackage
    );

    // 5. Aggregate findings (deterministic dedup)
    const aggregatedFindings = this.aggregator.aggregate(results);

    // 6. Build repository context for the report
    const repositoryContext: RepositoryContext = {
      owner: this.extractOwner(sanitizedPackage.repository),
      name: this.extractRepoName(sanitizedPackage.repository),
      prNumber: sanitizedPackage.prNumber,
      commitSha: sanitizedPackage.commitSha,
    };

    // 7. Generate the final report
    const report = this.reportGenerator.generate(
      results,
      aggregatedFindings,
      allCheckpoints.length,
      repositoryContext
    );

    const pipelineEndTime = performance.now();

    // 8. Compute Debug Metrics
    let rawFindingsCount = 0;
    let providerDurationMs = 0;
    const totalTokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    for (const res of results) {
      rawFindingsCount += res.findings.length;
      if (res.execution) {
        providerDurationMs += res.execution.llmDurationMs || 0;
        if (res.execution.tokenUsage) {
          totalTokenUsage.promptTokens += res.execution.tokenUsage.promptTokens;
          totalTokenUsage.completionTokens += res.execution.tokenUsage.completionTokens;
          totalTokenUsage.totalTokens += res.execution.tokenUsage.totalTokens;
        }
      }
    }

    const metrics: PipelineMetrics = {
      totalExecutionTimeMs: Math.round(pipelineEndTime - pipelineStartTime),
      routerDecisions: {
        selectedCheckpoints: selectedCheckpoints.length,
        skippedCheckpoints: allCheckpoints.length - selectedCheckpoints.length,
      },
      totalTokenUsage,
      rawFindingsCount,
      aggregatedFindingsCount: aggregatedFindings.length,
      providerDurationMs: Math.round(providerDurationMs),
    };

    return {
      report,
      metrics
    };
  }

  // ─── Private Methods ────────────────────────────────────────────

  /**
   * Execute all selected checkpoints in parallel using Promise.allSettled.
   * One failed checkpoint never cancels the others.
   */
  private async executeCheckpoints(
    checkpoints: RegisteredCheckpoint[],
    sanitizedPackage: SanitizedContextPackage
  ): Promise<CheckpointResult[]> {
    const runner = new CheckpointRunner(this.provider);

    const promises = checkpoints.map((cp) =>
      runner.run(sanitizedPackage, SECURITY_REVIEW_FRAMEWORK, cp.spec)
    );

    const settled = await Promise.allSettled(promises);
    const results: CheckpointResult[] = [];

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      const cp = checkpoints[i];

      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        // Build an error result so partial failures are visible in the report
        results.push({
          checkpointId: cp.id,
          checkpointName: cp.name,
          verdict: "NOT_VERIFIED",
          confidence: 0,
          summary: `Checkpoint failed: ${outcome.reason?.message || "Unknown error"}`,
          findings: [],
          status: "error",
          error: outcome.reason?.message || "Unknown error",
          execution: {
            executionTimeMs: 0,
            llmDurationMs: 0,
            model: this.provider.name,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    return results;
  }

  /**
   * Extract the owner from a "owner/repo" string.
   * Falls back to the full string if no slash is present.
   */
  private extractOwner(repository: string): string {
    const parts = repository.split("/");
    return parts.length >= 2 ? parts[0] : repository;
  }

  /**
   * Extract the repo name from a "owner/repo" string.
   * Falls back to the full string if no slash is present.
   */
  private extractRepoName(repository: string): string {
    const parts = repository.split("/");
    return parts.length >= 2 ? parts[1] : repository;
  }
}
