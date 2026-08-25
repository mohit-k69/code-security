import { SanitizedContextPackage, SanitizationMetadata, groupBy } from "./types.ts";
import { DetectionResult, SecretFinding } from "./SensitiveDataDetector.ts";
import { PlaceholderRegistry } from "./PlaceholderRegistry.ts";

// Re-export for backward compatibility
export type { SanitizedContextPackage, SanitizationMetadata } from "./types.ts";

export class SensitiveDataSanitizer {
  private registry: PlaceholderRegistry;

  constructor(registry: PlaceholderRegistry) {
    this.registry = registry;
  }

  public sanitize(detectionResult: DetectionResult): SanitizedContextPackage {
    const startTime = performance.now();
    const originalPackage = detectionResult.contextPackage;
    const findings = detectionResult.secretDetectionReport.findings;

    // Group findings by file using shared utility
    const findingsByFile = groupBy(findings, f => f.file);

    let totalSecretsReplaced = 0;
    let ignoredReplacements = 0;
    const replacementTypes: Record<string, number> = {};

    // Helper to sanitize a single file's content
    const sanitizeFileContent = (path: string, originalContent: string): string => {
      const fileFindings = findingsByFile.get(path);
      if (!fileFindings || fileFindings.length === 0) {
        return originalContent; // No secrets, return as is
      }

      // Group findings by line number using shared utility
      const findingsByLine = groupBy(fileFindings, f => f.line);

      const lines = originalContent.split('\n');

      for (const [lineNumber, lineFindings] of findingsByLine.entries()) {
        const lineIndex = lineNumber - 1; // 0-indexed for array
        if (lineIndex < 0 || lineIndex >= lines.length) continue;

        let currentLine = lines[lineIndex];

        // Sort findings descending by startColumn to replace right-to-left.
        // This prevents earlier replacements from shifting the column indices of later secrets.
        lineFindings.sort((a, b) => b.startColumn - a.startColumn);

        // Track replaced regions to prevent overlapping substitutions on the same line
        const mutatedRanges: { start: number; end: number }[] = [];

        for (const finding of lineFindings) {
          const startIdx = finding.startColumn - 1; // 0-indexed string position
          // endColumn is match.index + length, so to get exclusive 0-indexed end, it's just finding.endColumn - 1 + 1
          const endIdx = finding.endColumn; 

          // Check for overlapping matches
          const isOverlapping = mutatedRanges.some(r => Math.max(startIdx, r.start) < Math.min(endIdx, r.end));
          
          if (isOverlapping) {
            continue; // Already mutated this section
          }

          let placeholder = this.registry.getPlaceholder(finding.category);

          if (!placeholder) {
            ignoredReplacements++;
            continue; // Unknown secret type -> Skip replacement
          }

          // Ensure the string actually matches what we expect (sanity check)
          const actualValue = currentLine.substring(startIdx, endIdx);
          if (actualValue !== finding.matchedValue) {
            console.error(`Mismatch: actual='${actualValue}', matched='${finding.matchedValue}'`);
          }
          
          // Check for synthetic markers
          const syntheticMarkers = ["EXAMPLE", "FAKE", "MOCK", "DUMMY", "PLACEHOLDER", "TEST-ONLY", "DO-NOT-USE", "***REDACTED***"];
          const upperValue = finding.matchedValue.toUpperCase();
          for (const marker of syntheticMarkers) {
            if (upperValue.includes(marker)) {
              // Append the marker to the placeholder, e.g. <REDACTED_CLOUD_CREDENTIAL> -> <REDACTED_CLOUD_CREDENTIAL_EXAMPLE>
              placeholder = placeholder.replace('>', `_${marker}>`);
              break;
            }
          }

          if (actualValue === finding.matchedValue) {
            currentLine = currentLine.substring(0, startIdx) + placeholder + currentLine.substring(endIdx);
            
            mutatedRanges.push({ start: startIdx, end: endIdx });
            totalSecretsReplaced++;
            replacementTypes[finding.category] = (replacementTypes[finding.category] || 0) + 1;
          }
        }
        
        lines[lineIndex] = currentLine;
      }

      return lines.join('\n');
    };

    // Reconstruct the files to produce the sanitized package
    const sanitizedChangedFiles = originalPackage.changedFiles.map(file => {
      if (file.deleted || !file.content) return { ...file };
      return {
        ...file,
        content: sanitizeFileContent(file.path, file.content)
      };
    });

    const sanitizedDependencies = originalPackage.dependencies.map(file => {
      return {
        ...file,
        content: sanitizeFileContent(file.path, file.content)
      };
    });

    const endTime = performance.now();

    return {
      repository: originalPackage.repository,
      prNumber: originalPackage.prNumber,
      commitSha: originalPackage.commitSha,
      changedFiles: sanitizedChangedFiles,
      dependencies: sanitizedDependencies,
      metadata: {
        totalSecretsReplaced,
        replacementTypes,
        ignoredReplacements,
        processingTimeMs: endTime - startTime
      }
    };
  }
}
