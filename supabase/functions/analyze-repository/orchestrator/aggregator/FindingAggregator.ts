import type { CheckpointResult, CheckpointFinding, CheckpointEvidence } from "../../services/CheckpointRunner.ts";
import type { AggregatedFinding } from "./types.ts";

export class FindingAggregator {
  
  /**
   * Deterministically aggregates raw checkpoint findings into a cohesive, deduplicated report.
   * @param results The raw output from all executed CheckpointRunners.
   */
  public aggregate(results: CheckpointResult[]): AggregatedFinding[] {
    const flattenedItems: { finding: CheckpointFinding; parentResult: CheckpointResult }[] = [];
    
    // 1. Flatten all findings
    for (const result of results) {
      if (!result.findings) continue; // Skip errors or empty
      for (const finding of result.findings) {
        flattenedItems.push({ finding, parentResult: result });
      }
    }

    // Helper for Jaccard Similarity
    const computeSemanticSimilarity = (text1: string, text2: string): number => {
      const stopwords = new Set(["the", "is", "a", "in", "for", "this", "to", "and", "of", "on", "with", "as", "it", "by", "or", "an", "be", "are", "at", "from", "that", "which"]);
      const getWords = (text: string) => {
        const words = text.toLowerCase().match(/\b[a-z0-9_]+\b/g) || [];
        return new Set(words.filter(w => !stopwords.has(w)));
      };
      const set1 = getWords(text1);
      const set2 = getWords(text2);
      if (set1.size === 0 && set2.size === 0) return 1.0;
      if (set1.size === 0 || set2.size === 0) return 0.0;
      let intersectionCount = 0;
      for (const word of set1) {
        if (set2.has(word)) intersectionCount++;
      }
      return intersectionCount / (set1.size + set2.size - intersectionCount);
    };

    // 2. Group findings into deterministic clusters based on heuristics
    const clusters: { finding: CheckpointFinding; parentResult: CheckpointResult }[][] = [];

    for (const item of flattenedItems) {
      let matchedCluster = null;
      
      for (const cluster of clusters) {
        const canonical = cluster[0].finding;
        const f1 = canonical;
        const f2 = item.finding;

        const isSameFile = f1.primaryLocation.file === f2.primaryLocation.file;
        if (!isSameFile) continue;

        const isSameClass = f1.vulnerabilityClass === f2.vulnerabilityClass;
        const isNearby = Math.abs(f1.primaryLocation.line - f2.primaryLocation.line) <= 3;
        
        // If they share the exact same vulnerability class and are within 3 lines of each other,
        // they are deterministically the same finding (e.g. two checkpoints finding XSS on the same line).
        // EXCEPTION: Distinct hardcoded secrets on nearby lines are separate vulnerabilities and MUST NOT be merged unless on the exact same line.
        if (isSameClass && isNearby) {
          if (f1.vulnerabilityClass === "SECRET_EXPOSURE" && f1.primaryLocation.line !== f2.primaryLocation.line) {
            // Do not merge distinct secrets on different lines
          } else {
            matchedCluster = cluster;
            break;
          }
        }
        
        // If they are on the exact same line, but have different classes, we check for CWE overlap
        // to see if they are actually the same fundamental issue classified differently.
        const isSameLine = f1.primaryLocation.line === f2.primaryLocation.line;
        const sameCwe = Boolean(f1.cwes?.length > 0 && f2.cwes?.length > 0 && f1.cwes.some(c => f2.cwes?.includes(c)));
        
        if (isSameLine && sameCwe) {
          matchedCluster = cluster;
          break;
        }
      }

      if (matchedCluster) {
        matchedCluster.push(item);
      } else {
        clusters.push([item]);
      }
    }

    const aggregated: AggregatedFinding[] = [];

    // 3. Process each group into a single AggregatedFinding
    for (const group of clusters) {
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
        if (f.cwes && f.cwes.length > 0) {
          f.cwes.forEach(c => cwes.add(c));
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
        findingId: canonicalFinding.findingId,
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
