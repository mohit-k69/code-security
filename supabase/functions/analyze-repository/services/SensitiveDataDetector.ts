import { ContextPackage } from "./types.ts";
import { PatternRegistry } from "./PatternRegistry.ts";

export interface SecretFinding {
  id: string;
  file: string;
  line: number; // 1-indexed
  category: string;
  pattern: string;
  matchedValue: string;
  startColumn: number; // 1-indexed
  endColumn: number; // 1-indexed
}

export interface SecretDetectionReport {
  findings: SecretFinding[];
}

export interface DetectionResult {
  contextPackage: ContextPackage;
  secretDetectionReport: SecretDetectionReport;
}

export interface SecretScanner {
  detect(contextPackage: ContextPackage): DetectionResult;
}

export class SensitiveDataDetector implements SecretScanner {
  private registry: PatternRegistry;

  constructor(registry: PatternRegistry) {
    this.registry = registry;
  }

  public detect(contextPackage: ContextPackage): DetectionResult {
    const patterns = this.registry.getEnabledPatterns();
    const findings: SecretFinding[] = [];

    // Utility to scan a single file's content
    const scanContent = (filePath: string, content: string) => {
      const lines = content.split('\n');
      
      lines.forEach((lineText, lineIndex) => {
        const currentLineNumber = lineIndex + 1; // 1-indexed
        const lineFindings: SecretFinding[] = [];

        for (const pattern of patterns) {
          // Reset the global regex index before scanning a new line
          pattern.regex.lastIndex = 0;
          let match;

          while ((match = pattern.regex.exec(lineText)) !== null) {
            // Generate a secure UUID for the finding
            const findingId = crypto.randomUUID();

            lineFindings.push({
              id: findingId,
              file: filePath,
              line: currentLineNumber,
              category: pattern.category,
              pattern: pattern.name,
              matchedValue: match[0],
              startColumn: match.index + 1, // 1-indexed
              endColumn: match.index + match[0].length, // 1-indexed
            });
          }
        }

        // Filter out overlapping findings on the exact same line span (favor earlier/more specific patterns)
        const nonOverlapping: SecretFinding[] = [];
        for (const finding of lineFindings) {
          const overlaps = nonOverlapping.some(existing =>
            (finding.startColumn < existing.endColumn && finding.endColumn > existing.startColumn)
          );
          if (!overlaps) {
            nonOverlapping.push(finding);
          }
        }

        findings.push(...nonOverlapping);
      });
    };

    const scannedPaths = new Set<string>();

    // 1. Scan Changed Files
    for (const file of contextPackage.changedFiles) {
      // Edge Case: Deleted files (without content) -> Ignore
      if (!file.deleted && file.content && !scannedPaths.has(file.path)) {
        scanContent(file.path, file.content);
        scannedPaths.add(file.path);
      }
    }

    // 2. Scan Dependencies
    for (const file of contextPackage.dependencies) {
      if (file.content && !scannedPaths.has(file.path)) {
        scanContent(file.path, file.content);
        scannedPaths.add(file.path);
      }
    }

    // 3. Scan Full Repository Files
    if (contextPackage.fullRepositoryFiles) {
      for (const file of contextPackage.fullRepositoryFiles) {
        if (!file.deleted && file.content && !scannedPaths.has(file.path)) {
          scanContent(file.path, file.content);
          scannedPaths.add(file.path);
        }
      }
    }

    return {
      contextPackage: contextPackage, // Original Context Package remains unchanged
      secretDetectionReport: {
        findings
      }
    };
  }
}
