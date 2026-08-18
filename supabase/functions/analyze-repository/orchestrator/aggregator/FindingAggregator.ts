import type { CheckpointResult, CheckpointFinding, CheckpointEvidence } from "../../services/CheckpointRunner.ts";
import type { AggregatedFinding } from "./types.ts";

export class FindingAggregator {
  
  /**
   * Deterministically aggregates raw checkpoint findings into a cohesive, deduplicated report.
   * @param results The raw output from all executed CheckpointRunners.
   */
  public aggregate(results: CheckpointResult[]): AggregatedFinding[] {
    const findingGroups = new Map<string, { finding: CheckpointFinding; parentResult: CheckpointResult }[]>();

    // 1. Flatten and group all findings by their deterministic findingId
    for (const result of results) {
      if (!result.findings) continue; // Skip errors or empty
      
      for (const finding of result.findings) {
        const group = findingGroups.get(finding.findingId) || [];
        group.push({ finding, parentResult: result });
        findingGroups.set(finding.findingId, group);
      }
    }

    const aggregated: AggregatedFinding[] = [];

    // 2. Process each group into a single AggregatedFinding
    for (const [findingId, group] of findingGroups.entries()) {
      // Find the highest confidence to select canonical description/suggestion
      let highestConfidenceFinding = group[0];
      for (const item of group) {
        if (item.parentResult.confidence > highestConfidenceFinding.parentResult.confidence) {
          highestConfidenceFinding = item;
        }
      }

      const canonicalFinding = highestConfidenceFinding.finding;
      
      const cwes = new Set<string>();
      const contributingCheckpoints = new Set<string>();
      const uniqueEvidence = new Map<string, CheckpointEvidence>();
      
      let maxSeverity: "critical" | "warning" | "info" = "info";
      let maxConfidence = 0;

      for (const item of group) {
        const f = item.finding;
        const res = item.parentResult;
        
        // Track unique contributing checkpoints
        contributingCheckpoints.add(res.checkpointId);
        
        // Track max confidence
        if (res.confidence > maxConfidence) {
          maxConfidence = res.confidence;
        }

        // Track max severity (critical > warning > info)
        if (f.severity === "critical") {
          maxSeverity = "critical";
        } else if (f.severity === "warning" && maxSeverity !== "critical") {
          maxSeverity = "warning";
        }

        // Collect CWEs
        if (f.cwe) {
          cwes.add(f.cwe);
        }

        // Deduplicate evidence based on file + line + snippet substring
        if (f.evidence) {
          for (const ev of f.evidence) {
            const evKey = `${ev.file}|${ev.line}|${ev.snippet.substring(0, 50)}`;
            if (!uniqueEvidence.has(evKey)) {
              uniqueEvidence.set(evKey, ev);
            }
          }
        }
      }

      aggregated.push({
        findingId: findingId,
        vulnerabilityClass: canonicalFinding.vulnerabilityClass,
        primaryLocation: canonicalFinding.primaryLocation,
        severity: maxSeverity,
        confidence: maxConfidence,
        cwes: Array.from(cwes),
        description: canonicalFinding.description,
        suggestion: canonicalFinding.suggestion,
        evidence: Array.from(uniqueEvidence.values()),
        contributingCheckpoints: Array.from(contributingCheckpoints),
      });
    }

    return aggregated;
  }
}
