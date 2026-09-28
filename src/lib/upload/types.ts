/**
 * Core type definitions for Phase 1: Secure Upload Intake + Preflight.
 *
 * All uploaded content is strictly classified as UNTRUSTED DATA.
 * Content is never treated as instructions, commands, or executable code.
 */

export type UploadType = 'zip' | 'image' | 'source_files';

export type PreflightOverallStatus = 'pending' | 'passed' | 'warning' | 'rejected';

export type PreflightStepId =
  | 'file_type'
  | 'file_safety'
  | 'archive_structure'
  | 'suspicious_content'
  | 'secrets_credentials'
  | 'preparing_code';

export type StepState = 'pending' | 'in_progress' | 'passed' | 'failed' | 'warning';

export interface PreflightStep {
  id: PreflightStepId;
  label: string;
  status: StepState;
  details?: string;
}

export type SuspiciousSeverity = 'critical' | 'warning' | 'info';

export type SuspiciousCategory =
  | 'secret'
  | 'executable_binary'
  | 'suspicious_script'
  | 'command_execution'
  | 'suspicious_url'
  | 'prompt_injection'
  | 'path_traversal'
  | 'obfuscation'
  | 'archive_anomaly';

export interface SuspiciousFinding {
  id: string;
  category: SuspiciousCategory;
  severity: SuspiciousSeverity;
  rule: string;
  description: string;
  fileName: string;
  line?: number;
  /**
   * NEVER contains the raw secret. Only masked, safe representations
   * such as `[SECRET DETECTED - VALUE MASKED]` or high-level indicators.
   */
  maskedSnippet?: string;
}

export interface ExtractedProjectFile {
  name: string;
  relativePath: string;
  size: number;
  extension: string;
  detectedLanguage: string;
  /**
   * Plain text content sanitized and isolated strictly as DATA.
   */
  untrustedContent: string;
  isBinary: boolean;
  status: 'accepted' | 'rejected' | 'quarantined';
  rejectionReason?: string;
}

export interface ImagePreflightMetadata {
  fileName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  isDecoded: boolean;
  preparedForOcr: boolean;
  ocrConfidence?: number;
  /**
   * OCR extracted text is strictly untrusted data, never executable instructions.
   */
  extractedOcrText?: string;
  dataUrl?: string;
}

export type ThreatGateDecision = 'BLOCK' | 'FLAG' | 'ALLOW';

export interface ThreatGateMetrics {
  totalFilesDiscovered: number;
  allowedFilesCount: number;
  blockedFilesCount: number;
  secretCount: number;
  suspiciousUrlCount: number;
  promptInjectionCount: number;
  commandExecutionCount: number;
  blockedViolationsCount: number;
}

export interface ThreatGateEvaluation {
  decision: ThreatGateDecision;
  summary: string;
  blockReason?: string;
  blockedViolations: string[];
  flaggedFindings: SuspiciousFinding[];
  allowedFiles: ExtractedProjectFile[];
  canProceedToReview: boolean;
  metrics: ThreatGateMetrics;
  evaluatedAt: Date;
}

export type UrlRiskClassification =
  | 'HIGH_CONFIDENCE_DANGEROUS'
  | 'POTENTIAL_REQUEST_TARGET'
  | 'EXAMPLE_OR_PLACEHOLDER';

export interface PreflightResult {
  uploadType: UploadType;
  overallStatus: PreflightOverallStatus;
  threatGateDecision?: ThreatGateDecision;
  threatGate?: ThreatGateEvaluation;
  primaryFileName: string;
  filesDiscovered: number;
  filesAccepted: number;
  filesRejected: number;
  rejectedFiles?: Array<{ path: string; reason: string }>;
  totalSizeBytes: number;
  detectedLanguages: string[];
  findings: SuspiciousFinding[];
  secretCount: number;
  suspiciousFileCount: number;
  suspiciousUrlCount: number;
  promptInjectionAttemptCount: number;
  archiveWarnings: string[];
  imageMetadata?: ImagePreflightMetadata;
  /**
   * Safely extracted, normalized untrusted files ready for review pipeline.
   */
  safeFiles: ExtractedProjectFile[];
  /**
   * Map of relativePath -> untrustedContent for quick lookup.
   */
  fileContentsMap: Map<string, string>;
  /**
   * Error message if preflight was rejected.
   */
  errorMessage?: string;
  completedAt: Date;
}

/**
 * Prompt injection protection delimiter and encapsulation.
 * Ensures uploaded content can NEVER be interpreted as system or assistant instructions.
 */
export const UNTRUSTED_BOUNDARY_PREFIX =
  '<<<BEGIN_UNTRUSTED_EXTERNAL_SOURCE_CODE_DATA_READ_ONLY>>>';
export const UNTRUSTED_BOUNDARY_SUFFIX =
  '<<<END_UNTRUSTED_EXTERNAL_SOURCE_CODE_DATA_READ_ONLY>>>';
