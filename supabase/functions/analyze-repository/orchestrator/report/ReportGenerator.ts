// ─── Report Generator ───────────────────────────────────────────
// Pure formatting component. No AI logic, no security analysis,
// no routing, no provider awareness.
//
// Accepts already-produced CheckpointResults and AggregatedFindings.
// Produces one deterministic SecurityReport.

import type { CheckpointResult } from "../../services/CheckpointRunner.ts";
import type { AggregatedFinding } from "../aggregator/types.ts";
import type {
  SecurityReport,
  RepositoryVerdict,
  RepositoryContext,
  CheckpointSummary,
  ReportFinding,
  FindingsBySeverity,
  CoverageSummary,
} from "./types.ts";

export class ReportGenerator {

  /**
   * Generate the final SecurityReport from checkpoint results
   * and aggregated findings.
   *
   * @param results   All CheckpointResults (including errors).
   * @param findings  The deduplicated, aggregated findings.
   * @param totalRegisteredCheckpoints  Total checkpoints in the registry
   *   (used to compute skipped count).
   */
  public generate(
    results: CheckpointResult[],
    findings: AggregatedFinding[],
    totalRegisteredCheckpoints: number,
    repositoryContext: RepositoryContext,
  ): SecurityReport {
    const checkpoints = this.buildCheckpointSummaries(results);
    const groupedFindings = this.groupFindingsBySeverity(findings);
    const coverage = this.buildCoverageSummary(results, totalRegisteredCheckpoints);
    const verdict = this.computeOverallVerdict(results, findings, repositoryContext);
    const scanId = this.generateScanId(repositoryContext);

    return {
      scanId,
      repository: repositoryContext,
      verdict,
      checkpoints,
      findings: groupedFindings,
      coverage,
      totalFindings: findings.length,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────

  /**
   * Compute the overall repository verdict from individual checkpoint results.
   *
   * Rules (deterministic, no scoring):
   *  1. If ANY checkpoint has verdict "FAIL", the overall verdict is FAIL.
   *  2. If NO checkpoint failed but ANY is "NOT_VERIFIED", the overall is NOT_VERIFIED.
   *  3. Otherwise, PASS.
   */
  private computeOverallVerdict(
    results: CheckpointResult[],
    findings: AggregatedFinding[],
    repositoryContext: RepositoryContext
  ): RepositoryVerdict {
    const isPasteCode = repositoryContext.commitSha === "local";

    if (results.length === 0) {
      return isPasteCode ? "PASS" : "NOT_VERIFIED";
    }
    
    if (isPasteCode) {
      let hasFail = false;
      let hasApplicableNotVerified = false;

      for (const r of results) {
        if (r.verdict === "FAIL") {
          hasFail = true;
        }
        if (r.verdict === "NOT_VERIFIED") {
          if (r.applicability === "APPLICABLE" || r.applicability === "UNKNOWN") {
            hasApplicableNotVerified = true;
          }
        }
      }

      if (hasFail) return "FAIL";
      if (hasApplicableNotVerified) return "NOT_VERIFIED";
      return "PASS";
    }

    // GitHub behavior
    let hasNotVerified = false;
    for (const r of results) {
      if (r.verdict === "FAIL") return "FAIL";
      if (r.verdict === "NOT_VERIFIED") hasNotVerified = true;
    }

    return hasNotVerified ? "NOT_VERIFIED" : "PASS";
  }

  /**
   * Build the per-checkpoint summary array from raw results.
   */
  private buildCheckpointSummaries(results: CheckpointResult[]): CheckpointSummary[] {
    return results.map((r) => ({
      checkpointId: r.checkpointId,
      checkpointName: r.checkpointName,
      verdict: r.verdict,
      applicability: r.applicability,
      confidence: r.confidence,
      findingCount: r.findings.length,
      status: r.status,
      ...(r.error ? { error: r.error } : {}),
      executionTimeMs: r.execution.executionTimeMs,
    }));
  }

  /**
   * Group aggregated findings into severity buckets.
   * Within each bucket, findings are sorted by file path then line number
   * for deterministic ordering.
   */
  private groupFindingsBySeverity(findings: AggregatedFinding[]): FindingsBySeverity {
    const groups: FindingsBySeverity = {
      critical: [],
      warning: [],
      info: [],
    };

    for (const f of findings) {
      const reportFinding: ReportFinding = {
        findingId: f.findingId,
        title: `${f.vulnerabilityClass}: ${f.primaryLocation.file}:${f.primaryLocation.line}`,
        description: f.description,
        severity: f.severity,
        vulnerabilityClass: f.vulnerabilityClass,
        primaryLocation: f.primaryLocation,
        evidence: f.evidence,
        suggestion: f.suggestion,
        cwes: f.cwes,
        contributingCheckpoints: f.contributingCheckpoints,
      };

      groups[f.severity].push(reportFinding);
    }

    // Sort each bucket by file path, then line number for determinism
    const sortFn = (a: ReportFinding, b: ReportFinding): number => {
      const fileCmp = a.primaryLocation.file.localeCompare(b.primaryLocation.file);
      if (fileCmp !== 0) return fileCmp;
      return a.primaryLocation.line - b.primaryLocation.line;
    };

    groups.critical.sort(sortFn);
    groups.warning.sort(sortFn);
    groups.info.sort(sortFn);

    return groups;
  }

  /**
   * Build coverage metrics.
   */
  private buildCoverageSummary(
    results: CheckpointResult[],
    totalRegisteredCheckpoints: number,
  ): CoverageSummary {
    const executedCheckpoints = results.length;
    const skippedCheckpoints = totalRegisteredCheckpoints - executedCheckpoints;
    const notVerifiedCheckpoints = results.filter(
      (r) => r.verdict === "NOT_VERIFIED",
    ).length;

    return {
      totalCheckpoints: totalRegisteredCheckpoints,
      executedCheckpoints,
      skippedCheckpoints,
      notVerifiedCheckpoints,
    };
  }

  /**
   * Generate a deterministic scan ID from repository context + current timestamp.
   * Format: scan_{owner}_{repo}_pr{prNumber}_{timestamp}
   */
  private generateScanId(ctx: RepositoryContext): string {
    const ts = Date.now();
    return `scan_${ctx.owner}_${ctx.name}_pr${ctx.prNumber}_${ts}`;
  }
}
