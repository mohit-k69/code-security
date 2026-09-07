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

        const normalizeFile = (file?: string) => (file || "").replace(/^(\.\/|\/)/, "").trim();
        const f1File = normalizeFile(f1.primaryLocation?.file);
        const f2File = normalizeFile(f2.primaryLocation?.file);
        const isSameFile = f1File === f2File || !f1File || !f2File || f1File.endsWith(f2File) || f2File.endsWith(f1File);
        if (!isSameFile) continue;

        const f1Snippet = (f1.evidence?.[0]?.snippet || "").trim();
        const f2Snippet = (f2.evidence?.[0]?.snippet || "").trim();
        const hasIdenticalSnippet = f1Snippet.length > 5 && f2Snippet.length > 5 && (f1Snippet === f2Snippet || f1Snippet.includes(f2Snippet) || f2Snippet.includes(f1Snippet));

        const lineDiff = Math.abs(f1.primaryLocation.line - f2.primaryLocation.line);
        const isSameLine = lineDiff === 0;
        const isNearby = lineDiff <= 3;
        const isSameClass = f1.vulnerabilityClass === f2.vulnerabilityClass;

        // 1. SECRET_EXPOSURE specific deduplication
        if (f1.vulnerabilityClass === "SECRET_EXPOSURE" && f2.vulnerabilityClass === "SECRET_EXPOSURE") {
          if (isSameLine) {
            matchedCluster = cluster;
            break;
          }
          if (isNearby) {
            const isRedacted1 = /REDACTED/i.test(f1.description) || f1.evidence?.some(e => /REDACTED/i.test(e.snippet));
            const isRedacted2 = /REDACTED/i.test(f2.description) || f2.evidence?.some(e => /REDACTED/i.test(e.snippet));
            if (isRedacted1 || isRedacted2 || hasIdenticalSnippet) {
              matchedCluster = cluster;
              break;
            }
          }
          continue;
        }

        // 2. Same vulnerability class matching
        if (isSameClass) {
          if (isSameLine) {
            if (f1.vulnerabilityClass === "JWT_SECURITY") {
              const f1IsExp = /expir/i.test(f1.title + ' ' + f1.description);
              const f2IsExp = /expir/i.test(f2.title + ' ' + f2.description);
              if (f1IsExp === f2IsExp) {
                matchedCluster = cluster;
                break;
              }
            } else {
              matchedCluster = cluster;
              break;
            }
          } else if (hasIdenticalSnippet) {
            matchedCluster = cluster;
            break;
          } else if (isNearby && computeSemanticSimilarity(f1.description, f2.description) > 0.65) {
            matchedCluster = cluster;
            break;
          }
          continue;
        }

        // 3. Different classes on the exact same line with shared CWEs
        const sameCwe = Boolean(f1.cwes?.length && f2.cwes?.length && f1.cwes.some(c => f2.cwes?.includes(c)));
        if (isSameLine && sameCwe) {
          matchedCluster = cluster;
          break;
        }

        // 4. Compatible classes (INPUT_VALIDATION and SQL_INJECTION) with identical snippet on nearby lines (LLM jitter)
        const isInputValidationAndSqlInjection = 
          (f1.vulnerabilityClass === "INPUT_VALIDATION" && f2.vulnerabilityClass === "SQL_INJECTION") ||
          (f1.vulnerabilityClass === "SQL_INJECTION" && f2.vulnerabilityClass === "INPUT_VALIDATION");
        if (isNearby && isInputValidationAndSqlInjection && hasIdenticalSnippet) {
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
