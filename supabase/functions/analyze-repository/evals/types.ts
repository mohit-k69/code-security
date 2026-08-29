// ─── Evaluation Dataset Types ──────────────────────────────────────
// Schema definitions for AI Evals datasets.
// These types define the structure of the ground-truth benchmark
// datasets used to score checkpoint accuracy and grounding.

export interface EvalFile {
  path: string;
  content: string;
  deleted?: boolean;
}

export interface ExpectedEvidence {
  file: string;           // The file where the finding should be located
  line?: number;          // (Optional) The specific line number expected
  snippetSubstr?: string; // (Optional) Text that should be present in the evidence snippet
}

export interface ExpectedFinding {
  criterionId: string;    // e.g., "AUTH-C1"
  titleSubstr?: string;   // Substring to match in the finding title
  expectedEvidence?: ExpectedEvidence[]; // Validates that the AI correctly grounded the finding in the code
}

export interface EvalScenario {
  id: string;                         // e.g., "AUTH-FAIL-01"
  description: string;                // What the scenario tests
  tags: string[];                     // e.g., ["bcrypt", "login", "password-storage"]
  criteriaTargeted: string[];         // e.g., ["AUTH-C1"]
  changedFiles: EvalFile[];           // The PR context
  dependencies?: EvalFile[];          // Supporting files (not changed)
  expectedVerdict: "PASS" | "FAIL" | "NOT_VERIFIED";
  expectedFindings?: ExpectedFinding[]; // Omitted when PASS implies no findings should be generated
  rationale: string;                  // Why this verdict/finding is expected
}

export interface EvalDataset {
  checkpointId: string;
  version: string;
  scenarios: EvalScenario[];
}

import type { CheckpointResult } from "../services/CheckpointRunner";

export interface ScenarioResult {
  scenarioId: string;
  expectedVerdict: string;
  actualVerdict: string;
  verdictMatch: boolean;
  
  expectedFindingsCount: number;
  actualFindingsCount: number;
  falsePositives: number;
  falseNegatives: number;
  
  groundingScore: number;    // Percentage of findings that had accurate file/line/snippet evidence
  executionTimeMs: number;
  success: boolean;          // True if verdict matches AND falsePositives == 0 AND falseNegatives == 0
  error?: string;            // If the runner threw an exception
  
  actualOutput?: CheckpointResult; // Complete AI output retained for debugging
}

export interface EvalReport {
  datasetId: string;         // e.g., "SEC-AUTH-001"
  datasetVersion: string;
  model: string;             // e.g., "gemini-2.0-flash"
  timestamp: string;

  metrics: {
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    
    verdictAccuracy: number; // % of scenarios where actualVerdict == expectedVerdict
    detectionAccuracy: number; // % of scenarios completely succeeding (success == true)
    
    totalFalsePositives: number;
    totalFalseNegatives: number;
    falsePositiveRate: number; // FP / Total Scenarios
    falseNegativeRate: number; // FN / Total Scenarios
    
    averageGroundingAccuracy: number; // Average of grounding scores across all scenarios
    averageExecutionTimeMs: number;
  };

  scenarioResults: ScenarioResult[];
}
