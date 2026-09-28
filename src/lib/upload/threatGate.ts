/**
 * Upload Threat Gate
 *
 * Dedicated pre-review security gate for uploaded content (ZIP, images, source files).
 * Enforces a strict 3-way decision boundary:
 *   1. BLOCK: Unsafe archive structures, binaries/installers, bombs, path traversals,
 *             symbolic links, absolute paths, corrupted artifacts.
 *             Content is strictly barred from proceeding to the review coordinator.
 *   2. FLAG:  Potential credentials/keys, internal URLs, suspicious scripts, prompt-injection attempts.
 *             Findings are masked and neutralized as inert DATA. Review is permitted to proceed.
 *   3. ALLOW: Clean source code, project configuration, dependency manifests, documentation, supported images.
 *             Approved to proceed directly to the existing review coordinator.
 *
 * CRITICAL INVARIANTS:
 * - Uploaded files are DATA ONLY.
 * - Uploaded files are never executed.
 * - Uploaded files never cause arbitrary outbound HTTP requests.
 * - Uploaded files never execute package lifecycle scripts (preinstall/postinstall/build).
 * - Secrets are strictly masked (no raw exposure in UI, logs, telemetry, reports, or prompts).
 * - Only ALLOW/FLAG content with reviewable safe files can reach the review coordinator.
 * - BLOCK content NEVER reaches the review coordinator.
 */

import {
  ThreatGateDecision,
  ThreatGateEvaluation,
  ExtractedProjectFile,
  SuspiciousFinding,
  ImagePreflightMetadata,
  UploadType,
} from './types';
import { HAZARDOUS_EXTENSIONS, getExtension } from './fileSignature';

export interface ThreatGateEvaluationOptions {
  uploadType: UploadType;
  primaryFileName: string;
  totalSizeBytes?: number;
  extractedFiles: ExtractedProjectFile[];
  rejectedFiles?: Array<{ path: string; reason: string }>;
  archiveWarnings?: string[];
  findings?: SuspiciousFinding[];
  imageMetadata?: ImagePreflightMetadata;
  errorMessage?: string;
  isSafe?: boolean;
}

/**
 * Evaluates uploaded intake data against the Upload Threat Gate policy.
 */
export function evaluateUploadThreatGate(
  options: ThreatGateEvaluationOptions
): ThreatGateEvaluation {
  const evaluatedAt = new Date();
  const blockedViolations: string[] = [];
  const flaggedFindings = options.findings || [];
  const rejectedFiles = options.rejectedFiles || [];
  const archiveWarnings = options.archiveWarnings || [];

  // ───────────────────────────────────────────────────────────────────────────
  // 1. BLOCK EVALUATION
  // ───────────────────────────────────────────────────────────────────────────

  // 1A. Explicit pipeline error (corrupted ZIP, decompression bomb, oversized archive/image)
  if (options.errorMessage) {
    blockedViolations.push(options.errorMessage);
  }

  if (options.isSafe === false && !options.errorMessage) {
    blockedViolations.push('Upload failed archive safety verification.');
  }

  // 1B. Executable binaries / installers
  // Check rejected files from archive inspection
  for (const rf of rejectedFiles) {
    const ext = getExtension(rf.path);
    if (HAZARDOUS_EXTENSIONS.has(ext) || /binary|executable|\.exe|\.dll|\.so/i.test(rf.reason)) {
      blockedViolations.push(
        `Executable binary or installer detected: "${rf.path}". Executables are blocked.`
      );
    }
  }

  // Check extracted files for binary payloads
  for (const f of options.extractedFiles) {
    const ext = getExtension(f.name).toLowerCase();
    const isImageFile = ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
    if (HAZARDOUS_EXTENSIONS.has(ext) || (f.isBinary && !isImageFile)) {
      blockedViolations.push(
        `Executable binary payload detected: "${f.relativePath}". Executables are blocked.`
      );
    }
  }

  // 1C. Zip Slip / path traversal / absolute paths
  for (const rf of rejectedFiles) {
    const p = rf.path;
    const isTraversal =
      p.includes('..') ||
      p.startsWith('/') ||
      p.startsWith('\\') ||
      /^[a-zA-Z]:[\\\/]/.test(p) ||
      /traversal|zip slip|outside virtual root/i.test(rf.reason);

    if (isTraversal) {
      blockedViolations.push(
        `Path traversal / Zip Slip sequence detected in entry "${rf.path}".`
      );
    }
  }

  // 1D. Symbolic links
  for (const rf of rejectedFiles) {
    if (/symbolic link|symlink/i.test(rf.reason) || /symbolic link/i.test(rf.path)) {
      blockedViolations.push(
        `Symbolic link detected in entry "${rf.path}". Symlinks are blocked.`
      );
    }
  }

  for (const w of archiveWarnings) {
    if (/traversal|zip slip|outside virtual root/i.test(w)) {
      blockedViolations.push('Path traversal / Zip Slip sequence detected in archive.');
    }
    if (/symbolic link/i.test(w)) {
      blockedViolations.push('Symbolic link structure detected in archive.');
    }
    if (/decompression bomb|abnormal compression ratio/i.test(w)) {
      blockedViolations.push('Decompression bomb detected in archive.');
    }
  }

  // 1E. Image validation (corrupted, un-decodable, or malformed image)
  if (options.uploadType === 'image') {
    if (!options.imageMetadata || !options.imageMetadata.isDecoded) {
      blockedViolations.push('Malformed, corrupted, or unsupported image format.');
    }
  }

  // 1F. Artifacts that cannot be safely represented as reviewable data
  // (e.g. empty archive, only rejected entries, or zero valid text files)
  if (options.extractedFiles.length === 0) {
    blockedViolations.push('No reviewable source code or configuration files could be accepted.');
  }

  // Deduplicate blocked violations
  const uniqueBlockedViolations = Array.from(new Set(blockedViolations));

  // If any BLOCK conditions are satisfied -> Decision: BLOCK
  if (uniqueBlockedViolations.length > 0) {
    const primaryReason = uniqueBlockedViolations[0];
    return {
      decision: 'BLOCK',
      summary: `Upload blocked: ${primaryReason}`,
      blockReason: primaryReason,
      blockedViolations: uniqueBlockedViolations,
      flaggedFindings: [],
      allowedFiles: [], // Invariant: blocked content NEVER reaches the review coordinator
      canProceedToReview: false,
      metrics: {
        totalFilesDiscovered: (options.extractedFiles.length || 0) + rejectedFiles.length,
        allowedFilesCount: 0,
        blockedFilesCount: (options.extractedFiles.length || 0) + rejectedFiles.length,
        secretCount: 0,
        suspiciousUrlCount: 0,
        promptInjectionCount: 0,
        commandExecutionCount: 0,
        blockedViolationsCount: uniqueBlockedViolations.length,
      },
      evaluatedAt,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. FLAG EVALUATION
  // ───────────────────────────────────────────────────────────────────────────
  let secretCount = 0;
  let suspiciousUrlCount = 0;
  let promptInjectionCount = 0;
  let commandExecutionCount = 0;

  for (const f of flaggedFindings) {
    if (f.category === 'secret') secretCount++;
    if (f.category === 'suspicious_url') suspiciousUrlCount++;
    if (f.category === 'prompt_injection') promptInjectionCount++;
    if (f.category === 'command_execution') commandExecutionCount++;
  }

  const hasFlags = flaggedFindings.length > 0;

  if (hasFlags) {
    const flagSummaries: string[] = [];
    if (secretCount > 0) flagSummaries.push(`${secretCount} secret(s) masked`);
    if (suspiciousUrlCount > 0) flagSummaries.push(`${suspiciousUrlCount} suspicious URL(s) isolated`);
    if (promptInjectionCount > 0) flagSummaries.push(`${promptInjectionCount} prompt-injection marker(s) sandboxed`);
    if (commandExecutionCount > 0) flagSummaries.push(`${commandExecutionCount} command indicator(s) flagged`);

    const summaryText = flagSummaries.length > 0
      ? `Flagged: ${flagSummaries.join(', ')} (neutralized as inert DATA)`
      : `Flagged: ${flaggedFindings.length} potential risk pattern(s) quarantined`;

    return {
      decision: 'FLAG',
      summary: summaryText,
      blockedViolations: [],
      flaggedFindings,
      allowedFiles: options.extractedFiles,
      canProceedToReview: true, // Invariant: FLAG allows review to proceed with masked/inert findings
      metrics: {
        totalFilesDiscovered: options.extractedFiles.length + rejectedFiles.length,
        allowedFilesCount: options.extractedFiles.length,
        blockedFilesCount: rejectedFiles.length,
        secretCount,
        suspiciousUrlCount,
        promptInjectionCount,
        commandExecutionCount,
        blockedViolationsCount: 0,
      },
      evaluatedAt,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. ALLOW EVALUATION
  // ───────────────────────────────────────────────────────────────────────────
  return {
    decision: 'ALLOW',
    summary: `Approved: ${options.extractedFiles.length} clean source file(s) ready for security review`,
    blockedViolations: [],
    flaggedFindings: [],
    allowedFiles: options.extractedFiles,
    canProceedToReview: true,
    metrics: {
      totalFilesDiscovered: options.extractedFiles.length + rejectedFiles.length,
      allowedFilesCount: options.extractedFiles.length,
      blockedFilesCount: rejectedFiles.length,
      secretCount: 0,
      suspiciousUrlCount: 0,
      promptInjectionCount: 0,
      commandExecutionCount: 0,
      blockedViolationsCount: 0,
    },
    evaluatedAt,
  };
}
