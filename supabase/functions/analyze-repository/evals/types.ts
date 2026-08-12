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
