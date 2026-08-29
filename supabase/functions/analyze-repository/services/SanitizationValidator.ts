import { ContextPackage, SanitizedContextPackage } from "./types";
import { SecretScanner } from "./SensitiveDataDetector";

export class SanitizationValidator {
  private scanner: SecretScanner;

  constructor(scanner: SecretScanner) {
    this.scanner = scanner;
  }

  /**
   * Validates the sanitized context package against strict security and structural rules.
   * Throws an error if validation fails.
   */
  public validate(original: ContextPackage, sanitized: SanitizedContextPackage): void {
    // 1. Verify Context Package Integrity
    if (original.repository !== sanitized.repository) {
      throw new Error("Validation Failed: Repository was mutated.");
    }
    if (original.prNumber !== sanitized.prNumber) {
      throw new Error("Validation Failed: Pull Request Number was mutated.");
    }
    if (original.commitSha !== sanitized.commitSha) {
      throw new Error("Validation Failed: Commit SHA was mutated.");
    }

    // 2. Verify File Counts
    if (original.changedFiles.length !== sanitized.changedFiles.length) {
      throw new Error("Validation Failed: Changed files count does not match.");
    }
    if (original.dependencies.length !== sanitized.dependencies.length) {
      throw new Error("Validation Failed: Dependencies count does not match.");
    }

    // 3. Verify Line Counts (Preserve formatting/lines rule)
    for (let i = 0; i < original.changedFiles.length; i++) {
      const origFile = original.changedFiles[i];
      const sanFile = sanitized.changedFiles[i];

      if (origFile.content && sanFile.content) {
        if (origFile.content.split('\n').length !== sanFile.content.split('\n').length) {
          throw new Error(`Validation Failed: Line count changed for file ${origFile.path}`);
        }
      }
    }

    for (let i = 0; i < original.dependencies.length; i++) {
      const origFile = original.dependencies[i];
      const sanFile = sanitized.dependencies[i];

      if (origFile.content && sanFile.content) {
        if (origFile.content.split('\n').length !== sanFile.content.split('\n').length) {
          throw new Error(`Validation Failed: Line count changed for dependency ${origFile.path}`);
        }
      }
    }

    // 4. Verify no detected secrets remain
    // We achieve this by running the scanner against the fully sanitized output package.
    // We need to cast it back to ContextPackage shape for the scanner.
    const packageToScan: ContextPackage = {
      repository: sanitized.repository,
      prNumber: sanitized.prNumber,
      commitSha: sanitized.commitSha,
      changedFiles: sanitized.changedFiles,
      dependencies: sanitized.dependencies,
      missingDependencies: original.missingDependencies, // Irrelevant for scanning, but keeps typing happy
      metadata: original.metadata
    };

    const reScanResult = this.scanner.detect(packageToScan);
    const remainingSecrets = reScanResult.secretDetectionReport.findings;

    if (remainingSecrets.length > 0) {
      throw new Error(`Validation Failed: ${remainingSecrets.length} secrets remained undetected or improperly sanitized.`);
    }

    // Every expected replacement applied is implicitly verified if re-scan is clean 
    // and line/file counts match.
  }
}
