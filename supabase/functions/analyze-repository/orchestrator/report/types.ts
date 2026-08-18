// ─── Report Generator Types ─────────────────────────────────────
// Output schema for the final security review report.
// The Report Generator is a pure formatting component.
// It contains no AI logic, no security analysis, and no routing.

import type { VulnerabilityClass } from "../types/VulnerabilityClass.ts";
import type { Location, CheckpointEvidence, CheckpointVerdict } from "../../services/CheckpointRunner.ts";

// ─── Report-Level Types ─────────────────────────────────────────

export type RepositoryVerdict = "PASS" | "FAIL" | "NOT_VERIFIED";

export interface CheckpointSummary {
  checkpointId: string;
  checkpointName: string;
  verdict: CheckpointVerdict;
  confidence: number;
  executionTimeMs: number;
  findingCount: number;
  status: "completed" | "error";
  error?: string;
}

export interface ReportFinding {
  findingId: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  vulnerabilityClass: VulnerabilityClass;
  primaryLocation: Location;
  evidence: CheckpointEvidence[];
  suggestion: string;
  cwes: string[];
  contributingCheckpoints: string[];
}

export interface FindingsBySeverity {
  critical: ReportFinding[];
  warning: ReportFinding[];
  info: ReportFinding[];
}

export interface CoverageSummary {
  totalCheckpoints: number;
  executedCheckpoints: number;
  skippedCheckpoints: number;
  notVerifiedCheckpoints: number;
}

export interface RepositoryContext {
  /** The repository owner (e.g., "acme-corp") */
  owner: string;

  /** The repository name (e.g., "web-app") */
  name: string;

  /** The PR number this report covers */
  prNumber: number;

  /** The commit SHA that was reviewed */
  commitSha: string;
}

export interface SecurityReport {
  /** Backend-generated unique identifier for this scan */
  scanId: string;

  /** Repository and PR metadata */
  repository: RepositoryContext;

  /** The overall repository-level verdict */
  verdict: RepositoryVerdict;

  /** Summary of each checkpoint execution */
  checkpoints: CheckpointSummary[];

  /** Aggregated findings grouped by severity */
  findings: FindingsBySeverity;

  /** Coverage metrics */
  coverage: CoverageSummary;

  /** Total unique findings across all checkpoints */
  totalFindings: number;

  /** ISO 8601 timestamp of report generation */
  generatedAt: string;
}
