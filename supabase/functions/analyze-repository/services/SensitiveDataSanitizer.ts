import { ContextPackage } from "./ContextManager.ts";
import { DetectionResult, SecretFinding } from "./SensitiveDataDetector.ts";
import { PlaceholderRegistry } from "./PlaceholderRegistry.ts";

export interface SanitizationMetadata {
  totalSecretsReplaced: number;
  replacementTypes: Record<string, number>;
  ignoredReplacements: number;
  processingTimeMs: number;
}

export interface SanitizedContextPackage {
  repository: string;
  prNumber: number;
  commitSha: string;
  changedFiles: { path: string; content?: string; deleted: boolean }[];
  dependencies: { path: string; content: string }[];
  metadata: SanitizationMetadata;
}

export class SensitiveDataSanitizer {
  private registry: PlaceholderRegistry;

  constructor(registry: PlaceholderRegistry) {
    this.registry = registry;
  }

  public sanitize(detectionResult: DetectionResult): SanitizedContextPackage {
    const startTime = performance.now();
    const originalPackage = detectionResult.contextPackage;
    const findings = detectionResult.secretDetectionReport.findings;

    // Group findings by file
    const findingsByFile = new Map<string, SecretFinding[]>();
    for (const finding of findings) {
      if (!findingsByFile.has(finding.file)) {
        findingsByFile.set(finding.file, []);
      }
      findingsByFile.get(finding.file)!.push(finding);
    }

    let totalSecretsReplaced = 0;
    let ignoredReplacements = 0;
    const replacementTypes: Record<string, number> = {};

    // Helper to sanitize a single file's content
    const sanitizeFileContent = (path: string, originalContent: string): string => {
      const fileFindings = findingsByFile.get(path);
      if (!fileFindings || fileFindings.length === 0) {
        return originalContent; // No secrets, return as is
      }

      // Group findings by line number (1-indexed)
      const findingsByLine = new Map<number, SecretFinding[]>();
      for (const finding of fileFindings) {
        if (!findingsByLine.has(finding.line)) {
          findingsByLine.set(finding.line, []);
        }
        findingsByLine.get(finding.line)!.push(finding);
      }

      const lines = originalContent.split('\n');

      for (const [lineNumber, lineFindings] of findingsByLine.entries()) {
        const lineIndex = lineNumber - 1; // 0-indexed for array
        if (lineIndex < 0 || lineIndex >= lines.length) continue;

        let currentLine = lines[lineIndex];

        // Sort findings descending by startColumn to replace right-to-left.
        // This prevents earlier replacements from shifting the column indices of later secrets.
        lineFindings.sort((a, b) => b.startColumn - a.startColumn);

        // Track replaced regions to prevent overlapping substitutions on the same line
        // We track the original column indices that have been mutated.
        const mutatedRanges: { start: number; end: number }[] = [];

        for (const finding of lineFindings) {
          const startIdx = finding.startColumn - 1; // 0-indexed string position
          const endIdx = finding.endColumn - 1;

          // Check for overlapping matches
          const isOverlapping = mutatedRanges.some(r => Math.max(startIdx, r.start) < Math.min(endIdx, r.end));
          
          if (isOverlapping) {
            // Already mutated this section (overlapping match), skip it.
            continue;
          }

          const placeholder = this.registry.getPlaceholder(finding.category);

          if (!placeholder) {
            ignoredReplacements++;
            continue; // Unknown secret type -> Skip replacement
          }

          // Ensure the string actually matches what we expect (sanity check)
          const actualValue = currentLine.substring(startIdx, endIdx);
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

    // Deep copy/reconstruct the files to produce the sanitized package
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
