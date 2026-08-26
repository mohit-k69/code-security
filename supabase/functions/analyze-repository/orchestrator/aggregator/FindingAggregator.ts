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

    // 2. Group findings into semantic clusters
    const clusters: { finding: CheckpointFinding; parentResult: CheckpointResult }[][] = [];

    for (const item of flattenedItems) {
      let matchedCluster = null;
      
      for (const cluster of clusters) {
        const canonical = cluster[0].finding;
        const f1 = canonical;
        const f2 = item.finding;

        const isSameFile = f1.primaryLocation.file === f2.primaryLocation.file;
        if (!isSameFile) continue;

        // -------------------------------------------------------------
        // NEW STRICT RULE FOR SECRET_EXPOSURE
        // -------------------------------------------------------------
        if (f1.vulnerabilityClass === "SECRET_EXPOSURE" || f2.vulnerabilityClass === "SECRET_EXPOSURE") {
          // If both are SECRET_EXPOSURE, they must be on the same line to merge
          if (f1.vulnerabilityClass === f2.vulnerabilityClass) {
             if (f1.primaryLocation.line === f2.primaryLocation.line || f1.findingId === f2.findingId) {
                matchedCluster = cluster;
                break;
             }
             // Distinct secrets (different lines) must remain separate.
             continue;
          }
          
          // If they are different classes (e.g., SECRET_EXPOSURE vs JWT_SECURITY),
          // DO NOT block them from falling through to the semantic similarity checks below!
          // We simply let them pass through.
        }
        // -------------------------------------------------------------

        const isNearby = Math.abs(f1.primaryLocation.line - f2.primaryLocation.line) <= 3;
        
        const snippet1 = f1.evidence?.[0]?.snippet || "";
        const snippet2 = f2.evidence?.[0]?.snippet || "";
        const clean1 = snippet1.replace(/\s+/g, '');
        const clean2 = snippet2.replace(/\s+/g, '');
        const isSubstring = Boolean(clean1 && clean2 && (clean1.includes(clean2) || clean2.includes(clean1)));
        const snippetSimilarity = computeSemanticSimilarity(snippet1, snippet2);
        
        const hasSnippetOverlap = isSubstring || snippetSimilarity > 0.3;

        const isStrongSnippetOverlap = isSubstring || snippetSimilarity > 0.6;
        if (!isNearby && !isStrongSnippetOverlap) continue;

        const text1 = `${f1.vulnerabilityClass} ${f1.title} ${f1.description}`;
        const text2 = `${f2.vulnerabilityClass} ${f2.title} ${f2.description}`;
        
        let similarity = computeSemanticSimilarity(text1, text2);
        
        // Strongly reduce merge likelihood if evidence snippets do not overlap
        if (!hasSnippetOverlap) {
          similarity *= 0.2;
        }

        const sameCwe = Boolean(f1.cwes?.length > 0 && f2.cwes?.length > 0 && f1.cwes.some(c => f2.cwes?.includes(c)));

        if (similarity >= 0.15 || (sameCwe && hasSnippetOverlap)) {
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
