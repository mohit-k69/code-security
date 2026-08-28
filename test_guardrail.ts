import { FindingGuardrail } from "./supabase/functions/analyze-repository/services/FindingGuardrail.ts";
import type { CheckpointResult } from "./supabase/functions/analyze-repository/services/CheckpointRunner.ts";

const result: CheckpointResult = {
  checkpointId: "SEC-AUTHZ-001",
  checkpointName: "Authorization",
  verdict: "FAIL",
  applicability: "APPLICABLE",
  confidence: 0.99,
  findings: [
    {
      findingId: "1",
      criterionId: "AUTHZ-C3",
      vulnerabilityClass: "AUTH_BYPASS",
      cwes: ["CWE-862"],
      primaryLocation: { file: "snippet.js", line: 1 },
      title: "Title",
      severity: "critical",
      description: "Description",
      suggestion: "Suggest",
      evidence: [
        {
          file: "snippet.js",
          line: 1,
          snippet: "app.post('/api/admin/delete_user', (req, res) => {",
          explanation: "Explanation"
        }
      ]
    }
  ],
  status: "completed",
  execution: {
      executionTimeMs: 0,
      llmDurationMs: 0,
      model: "test",
      timestamp: ""
  }
};

const contextPackage = {
    repository: "test",
    prNumber: 0,
    commitSha: "local",
    changedFiles: [{
        path: "snippet.js",
        content: "app.post('/api/admin/delete_user', (req, res) => {\n  db.users.delete(req.body.userId);\n  res.send('Deleted');\n});",
        deleted: false
    }],
    dependencies: [],
    missingDependencies: [],
    metadata: { totalFiles: 1, totalChars: 100, truncated: false }
};

const processed = FindingGuardrail.applyGuardrails(result, contextPackage as any);
console.log(JSON.stringify(processed, null, 2));
