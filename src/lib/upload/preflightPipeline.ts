/**
 * Preflight Pipeline Orchestrator for Phase 1 Secure Upload Intake.
 *
 * Coordinates:
 * 1. File Type & Signature Validation
 * 2. Archive / Image Preflight & Quarantine Isolation
 * 3. Security & Secret Inspection (No Secret Exposure)
 * 4. Content Preparation with Strict Prompt-Injection Boundaries
 * 5. Structured PreflightResult generation
 *
 * INVARIANT: Never connects to or invokes LLM / Gemini APIs in Phase 1.
 */

import {
  PreflightResult,
  PreflightStep,
  PreflightStepId,
  StepState,
  ExtractedProjectFile,
  SuspiciousFinding,
  UploadType,
} from './types';
import {
  UPLOAD_LIMITS,
  detectSignature,
  validateSafeFileName,
  isSupportedSourceExtension,
  detectLanguage,
  getExtension,
} from './fileSignature';
import { inspectAndExtractZip } from './zipPreflight';
import { inspectAndPreflightImage } from './imagePreflight';
import { scanFileForRisks, encapsulateUntrustedData } from './securityScanner';
import { evaluateUploadThreatGate } from './threatGate';

export const INITIAL_PREFLIGHT_STEPS: PreflightStep[] = [
  { id: 'file_type', label: 'File type', status: 'pending' },
  { id: 'file_safety', label: 'File safety', status: 'pending' },
  { id: 'archive_structure', label: 'Archive structure', status: 'pending' },
  { id: 'suspicious_content', label: 'Suspicious content', status: 'pending' },
  { id: 'secrets_credentials', label: 'Secrets & credentials', status: 'pending' },
  { id: 'preparing_code', label: 'Preparing code', status: 'pending' },
];

export interface RunPreflightOptions {
  onStepProgress?: (stepId: PreflightStepId, state: StepState, details?: string) => void;
}

/**
 * Executes the complete Phase 1 Preflight pipeline on uploaded files.
 */
export async function runPreflightPipeline(
  files: Array<{ name: string; bytes: Uint8Array; size?: number }>,
  options?: RunPreflightOptions
): Promise<PreflightResult> {
  const notify = (stepId: PreflightStepId, state: StepState, details?: string) => {
    if (options?.onStepProgress) {
      options.onStepProgress(stepId, state, details);
    }
  };

  const completedAt = new Date();

  // Helper for early rejection result
  const makeRejectedResult = (
    primaryName: string,
    message: string,
    uploadType: UploadType = 'source_files',
    archiveWarnings: string[] = [],
    rejectedFiles: Array<{ path: string; reason: string }> = []
  ): PreflightResult => {
    const threatGate = evaluateUploadThreatGate({
      uploadType,
      primaryFileName: primaryName,
      extractedFiles: [],
      errorMessage: message,
      archiveWarnings,
      rejectedFiles,
      isSafe: false,
    });

    return {
      uploadType,
      overallStatus: 'rejected',
      threatGateDecision: 'BLOCK',
      threatGate,
      primaryFileName: primaryName,
      filesDiscovered: files.length,
      filesAccepted: 0,
      filesRejected: files.length,
      totalSizeBytes: files.reduce((acc, f) => acc + (f.size || f.bytes.byteLength), 0),
      detectedLanguages: [],
      findings: [],
      secretCount: 0,
      suspiciousFileCount: 0,
      suspiciousUrlCount: 0,
      promptInjectionAttemptCount: 0,
      archiveWarnings,
      safeFiles: [],
      fileContentsMap: new Map(),
      errorMessage: message,
      completedAt,
    };
  };

  // 1. Check file count bounds
  if (!files || files.length === 0) {
    notify('file_type', 'failed', 'No files provided');
    return makeRejectedResult('none', 'No files were provided for preflight verification.');
  }

  if (files.length > UPLOAD_LIMITS.MAX_UPLOAD_FILES_AT_ONCE) {
    notify('file_type', 'failed', 'Too many files');
    return makeRejectedResult(
      files[0].name,
      `Exceeded maximum upload limit of ${UPLOAD_LIMITS.MAX_UPLOAD_FILES_AT_ONCE} files at once.`
    );
  }

  notify('file_type', 'in_progress', 'Checking file signatures...');

  // 2. Identify primary upload type
  const firstFile = files[0];
  const firstSig = detectSignature(firstFile.bytes);
  const firstExt = getExtension(firstFile.name);

  let uploadType: UploadType = 'source_files';
  if (firstExt === 'zip' || firstSig === 'zip') {
    uploadType = 'zip';
  } else if (
    firstSig === 'image/png' ||
    firstSig === 'image/jpeg' ||
    firstSig === 'image/webp' ||
    ['png', 'jpg', 'jpeg', 'webp'].includes(firstExt)
  ) {
    uploadType = 'image';
  }

  // Enforce single ZIP constraint
  if (uploadType === 'zip' && files.length > 1) {
    notify('file_type', 'failed', 'Multiple ZIPs not supported');
    return makeRejectedResult(
      firstFile.name,
      'Please upload only one ZIP archive at a time for project review.',
      'zip'
    );
  }

  // Validate filename safety of all top-level files
  for (const f of files) {
    const safeCheck = validateSafeFileName(f.name);
    if (!safeCheck.isSafe) {
      notify('file_safety', 'failed', safeCheck.reason);
      return makeRejectedResult(f.name, `Filename rejected: ${safeCheck.reason}`, uploadType);
    }
  }

  notify('file_type', 'passed', `Detected ${uploadType.toUpperCase()} format`);
  notify('file_safety', 'in_progress', 'Validating size and boundaries...');

  let extractedFiles: ExtractedProjectFile[] = [];
  let archiveWarnings: string[] = [];
  let imageMetadata: PreflightResult['imageMetadata'];
  let totalDiscovered = 0;
  let totalAccepted = 0;
  let totalRejected = 0;
  let rejectedFilesList: Array<{ path: string; reason: string }> = [];

  // 3. Process based on upload type
  if (uploadType === 'zip') {
    notify('archive_structure', 'in_progress', 'Inspecting ZIP archive in quarantine...');
    const zipResult = await inspectAndExtractZip(firstFile.bytes);

    if (!zipResult.isSafe || zipResult.error) {
      notify('archive_structure', 'failed', zipResult.error);
      return makeRejectedResult(firstFile.name, zipResult.error || 'Failed ZIP inspection', 'zip', zipResult.warnings, zipResult.rejectedFiles);
    }

    notify('file_safety', 'passed', 'Archive sizes verified');
    notify('archive_structure', 'passed', `${zipResult.acceptedFiles.length} project files extracted safely`);

    extractedFiles = zipResult.acceptedFiles;
    archiveWarnings = zipResult.warnings;
    totalDiscovered = zipResult.totalFilesDiscovered;
    totalAccepted = zipResult.acceptedFiles.length;
    totalRejected = zipResult.rejectedFiles.length;
    rejectedFilesList = zipResult.rejectedFiles;
  } else if (uploadType === 'image') {
    notify('archive_structure', 'passed', 'Image format confirmed');
    notify('file_safety', 'in_progress', 'Decoding image dimensions & sanitizing...');

    const imageResult = await inspectAndPreflightImage(firstFile.bytes, firstFile.name);
    if (!imageResult.isSafe || !imageResult.metadata || !imageResult.preparedFile) {
      notify('file_safety', 'failed', imageResult.error);
      return makeRejectedResult(firstFile.name, imageResult.error || 'Invalid or malformed image.', 'image');
    }

    notify('file_safety', 'passed', `${imageResult.metadata.mimeType} (${imageResult.metadata.width ?? '?'}x${imageResult.metadata.height ?? '?'})`);
    imageMetadata = imageResult.metadata;
    extractedFiles = [imageResult.preparedFile];
    totalDiscovered = 1;
    totalAccepted = 1;
    totalRejected = 0;
  } else {
    // Multiple or single source code files
    notify('archive_structure', 'passed', 'Direct file upload');

    for (const f of files) {
      totalDiscovered++;
      const size = f.size || f.bytes.byteLength;
      if (size > UPLOAD_LIMITS.MAX_SOURCE_FILE_SIZE_BYTES) {
        archiveWarnings.push(`File "${f.name}" skipped: exceeds 2 MB limit.`);
        rejectedFilesList.push({ path: f.name, reason: "This file exceeds Cody's 2 MB code-file limit." });
        totalRejected++;
        continue;
      }

      const ext = getExtension(f.name);
      if (!isSupportedSourceExtension(ext) && f.name !== 'Dockerfile' && f.name !== 'Makefile') {
        archiveWarnings.push(`File "${f.name}" skipped: unsupported extension .${ext}`);
        rejectedFilesList.push({ path: f.name, reason: `Unsupported extension .${ext}` });
        totalRejected++;
        continue;
      }

      // Check binary signature
      const sig = detectSignature(f.bytes);
      if (sig === 'unsupported_binary') {
        archiveWarnings.push(`File "${f.name}" skipped: binary executable signature detected.`);
        rejectedFilesList.push({ path: f.name, reason: 'Binary executable signature detected.' });
        totalRejected++;
        continue;
      }

      // Decode UTF-8 string safely
      let textContent = '';
      try {
        const decoder = new TextDecoder('utf-8', { fatal: false });
        textContent = decoder.decode(f.bytes);
      } catch {
        archiveWarnings.push(`File "${f.name}" skipped: failed text decoding.`);
        rejectedFilesList.push({ path: f.name, reason: 'Failed text decoding.' });
        totalRejected++;
        continue;
      }

      const lang = detectLanguage(f.name);
      extractedFiles.push({
        name: f.name,
        relativePath: f.name,
        size,
        extension: ext,
        detectedLanguage: lang,
        untrustedContent: textContent,
        isBinary: false,
        status: 'accepted',
      });
      totalAccepted++;
    }

    if (extractedFiles.length > UPLOAD_LIMITS.MAX_REVIEWABLE_FILES) {
      notify('file_safety', 'failed', 'Too many reviewable files');
      return makeRejectedResult(firstFile.name, "This project contains more than 100 reviewable files.", 'source_files', archiveWarnings);
    }

    if (extractedFiles.length === 0) {
      notify('file_safety', 'failed', 'No supported source code files found');
      return makeRejectedResult(firstFile.name, 'No supported source code or config files could be accepted.', 'source_files', archiveWarnings);
    }

    notify('file_safety', 'passed', `${extractedFiles.length} source file(s) accepted`);
  }

  // 4. Initial security inspection
  notify('suspicious_content', 'in_progress', 'Scanning for command execution & SSRF vectors...');
  notify('secrets_credentials', 'in_progress', 'Scanning for hardcoded secrets...');

  const allFindings: SuspiciousFinding[] = [];
  const findingCounter = { count: 0 };
  let totalSecretCount = 0;
  let totalSuspiciousUrlCount = 0;
  let totalPromptInjectionCount = 0;
  let totalSuspiciousFileCount = 0;

  for (const file of extractedFiles) {
    const scan = scanFileForRisks(file, findingCounter);
    if (scan.findings.length > 0) {
      allFindings.push(...scan.findings);
    }
    totalSecretCount += scan.secretCount;
    totalSuspiciousUrlCount += scan.suspiciousUrlCount;
    totalPromptInjectionCount += scan.promptInjectionCount;
    if (scan.findings.some(f => f.category === 'command_execution' || f.category === 'executable_binary')) {
      totalSuspiciousFileCount++;
    }
  }

  if (totalSuspiciousUrlCount > 0 || totalSuspiciousFileCount > 0) {
    notify('suspicious_content', 'warning', `${totalSuspiciousFileCount} suspicious pattern(s) flagged`);
  } else {
    notify('suspicious_content', 'passed', 'No malicious execution patterns');
  }

  if (totalSecretCount > 0) {
    notify('secrets_credentials', 'warning', `${totalSecretCount} potential secret(s) masked & flagged`);
  } else {
    notify('secrets_credentials', 'passed', 'Zero secrets detected');
  }

  // 5. Code preparation with prompt-injection boundary protection
  notify('preparing_code', 'in_progress', 'Encapsulating untrusted data boundaries...');

  const fileContentsMap = new Map<string, string>();
  const detectedLanguages = Array.from(new Set(extractedFiles.map(f => f.detectedLanguage)));

  for (const file of extractedFiles) {
    // Encapsulate each file with strict untrusted data wrapper
    const encapsulated = encapsulateUntrustedData(file.untrustedContent, file.relativePath);
    fileContentsMap.set(file.relativePath, encapsulated);
  }

  notify('preparing_code', 'passed', 'Ready for review');

  const totalSizeBytes = extractedFiles.reduce((acc, f) => acc + f.size, 0);

  // 6. Upload Threat Gate Evaluation (BLOCK / FLAG / ALLOW)
  const threatGate = evaluateUploadThreatGate({
    uploadType,
    primaryFileName: firstFile.name,
    totalSizeBytes,
    extractedFiles,
    rejectedFiles: rejectedFilesList,
    archiveWarnings,
    findings: allFindings,
    imageMetadata,
  });

  const overallStatus: PreflightResult['overallStatus'] =
    threatGate.decision === 'BLOCK'
      ? 'rejected'
      : threatGate.decision === 'FLAG'
        ? 'warning'
        : 'passed';

  const finalSafeFiles = threatGate.canProceedToReview ? extractedFiles : [];
  const finalFileMap = threatGate.canProceedToReview ? fileContentsMap : new Map<string, string>();

  return {
    uploadType,
    overallStatus,
    threatGateDecision: threatGate.decision,
    threatGate,
    primaryFileName: firstFile.name,
    filesDiscovered: totalDiscovered,
    filesAccepted: finalSafeFiles.length,
    filesRejected: totalRejected,
    rejectedFiles: rejectedFilesList,
    totalSizeBytes,
    detectedLanguages,
    findings: allFindings,
    secretCount: totalSecretCount,
    suspiciousFileCount: totalSuspiciousFileCount,
    suspiciousUrlCount: totalSuspiciousUrlCount,
    promptInjectionAttemptCount: totalPromptInjectionCount,
    archiveWarnings,
    imageMetadata,
    safeFiles: finalSafeFiles,
    fileContentsMap: finalFileMap,
    errorMessage: threatGate.decision === 'BLOCK' ? threatGate.blockReason : undefined,
    completedAt,
  };
}
