// ─── Checkpoint Runner — Smoke Test Harness ─────────────────────
// Standalone test script for validating CheckpointRunner behavior.
//
// Run with:
//   GEMINI_API_KEY=<key> deno run --allow-net --allow-env \
//     supabase/functions/analyze-repository/services/__tests__/checkpoint_runner_smoke.ts
//
// This test does NOT require the Supabase runtime or any database.
// It feeds synthetic data into the runner and validates the output.

import { CheckpointRunner } from "../CheckpointRunner.ts";
import type { CheckpointResult } from "../CheckpointRunner.ts";
import type { ReviewSpecification } from "../../prompts/specifications/ReviewSpecification.ts";
import type { SanitizedContextPackage } from "../types.ts";
import { SECURITY_REVIEW_FRAMEWORK, FRAMEWORK_VERSION } from "../../prompts/SecurityReviewFramework.ts";
import { GeminiProvider } from "../../orchestrator/providers/GeminiProvider.ts";

// ─── Test Fixtures ───────────────────────────────────────────────

const MOCK_SANITIZED_PACKAGE: SanitizedContextPackage = {
  repository: "test-org/test-repo",
  prNumber: 42,
  commitSha: "abc123def456",
  changedFiles: [
    {
      path: "src/auth/login.ts",
      content: `
import express from 'express';
const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  // No rate limiting on login attempts
  const user = await db.query('SELECT * FROM users WHERE username = ?', [username]);
  if (user && user.password === password) {
    req.session.userId = user.id;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

export default router;
`.trim(),
      deleted: false,
    },
    {
      path: "src/auth/middleware.ts",
      content: `
export function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}
`.trim(),
      deleted: false,
    },
  ],
  dependencies: [],
  metadata: {
    totalSecretsReplaced: 0,
    replacementTypes: {},
    ignoredReplacements: 0,
    processingTimeMs: 12,
  },
};

const MOCK_SPEC: ReviewSpecification = {
  id: "SEC-AUTH-001",
  name: "Authentication Review",
  version: "1.0",
  category: "authentication",
  description: "Review authentication logic for security vulnerabilities including plaintext password comparison, missing rate limiting, session fixation, and weak credential handling.",
  criteria: [
    {
      id: "AUTH-C1",
      name: "Password Hashing",
      description: "Passwords must be hashed using bcrypt, scrypt, or Argon2. Plaintext comparison is a critical vulnerability.",
    },
    {
      id: "AUTH-C2",
      name: "Rate Limiting",
      description: "Login endpoints must implement rate limiting to prevent brute-force attacks.",
    },
    {
      id: "AUTH-C3",
      name: "Session Management",
      description: "Sessions must be regenerated after login. Session fixation must not be possible.",
    },
    {
      id: "AUTH-C4",
      name: "Input Validation",
      description: "All authentication inputs must be validated and sanitized before use.",
    },
  ],
  promptInstruction: `Report each issue as a separate finding with evidence from the code.
If a criterion cannot be evaluated due to missing context, note it in the summary.`,
};

// ─── Test Execution ──────────────────────────────────────────────

async function runSmokeTest(): Promise<void> {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Checkpoint Runner v1.0 — Smoke Test");
  console.log("═══════════════════════════════════════════════════\n");

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is not set. Cannot run live smoke test.");
    console.log("\nTo run: GEMINI_API_KEY=<your-key> deno run --allow-net --allow-env <this-file>");
    Deno.exit(1);
  }

  const model = Deno.env.get("GEMINI_MODEL") || "(default)";
  console.log(`🔧 Model:     ${model}`);
  console.log(`📋 Framework: v${FRAMEWORK_VERSION}`);
  console.log(`📦 Repo:      ${MOCK_SANITIZED_PACKAGE.repository}`);
  console.log(`🔀 PR:        #${MOCK_SANITIZED_PACKAGE.prNumber}`);
  console.log(`🎯 Check:     ${MOCK_SPEC.id} — ${MOCK_SPEC.name}`);
  console.log(`📄 Files:     ${MOCK_SANITIZED_PACKAGE.changedFiles.length}\n`);

  console.log("⏳ Executing checkpoint...\n");

  const runner = new CheckpointRunner(new GeminiProvider(model));
  const result: CheckpointResult = await runner.run(
    MOCK_SANITIZED_PACKAGE,
    SECURITY_REVIEW_FRAMEWORK,
    MOCK_SPEC
  );

  // ─── Validate Structure ─────────────────────────────────────────

  console.log("─── Result ──────────────────────────────────────────\n");
  console.log(`  Status:      ${result.status}`);
  console.log(`  Verdict:     ${result.verdict}`);
  console.log(`  Confidence:  ${result.confidence}`);
  console.log(`  Findings:    ${result.findings.length}`);
  console.log(`  Model:       ${result.execution.model}`);
  console.log(`  Time:        ${result.execution.executionTimeMs}ms`);
  console.log(`  Timestamp:   ${result.execution.timestamp}`);

  if (result.error) {
    console.log(`  Error:       ${result.error}`);
  }

  console.log(`\n  Summary:\n  ${result.summary}\n`);

  if (result.findings.length > 0) {
    console.log("─── Findings ────────────────────────────────────────\n");
    for (const finding of result.findings) {
      console.log(`  [${finding.severity.toUpperCase()}] ${finding.title}`);
      console.log(`    ${finding.description}`);
      console.log(`    Suggestion: ${finding.suggestion}`);
      if (finding.evidence.length > 0) {
        for (const e of finding.evidence) {
          console.log(`    📍 ${e.file}:${e.line} — ${e.explanation}`);
        }
      }
      console.log();
    }
  }

  // ─── Assertions ─────────────────────────────────────────────────

  console.log("─── Assertions ──────────────────────────────────────\n");

  let passed = 0;
  let failed = 0;

  function assert(label: string, condition: boolean): void {
    if (condition) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label}`);
      failed++;
    }
  }

  assert("status is 'completed' or 'error'", ["completed", "error"].includes(result.status));
  assert("verdict is PASS, FAIL, or NOT_VERIFIED", ["PASS", "FAIL", "NOT_VERIFIED"].includes(result.verdict));
  assert("confidence is between 0 and 1", result.confidence >= 0 && result.confidence <= 1);
  assert("summary is non-empty string", typeof result.summary === "string" && result.summary.length > 0);
  assert("findings is an array", Array.isArray(result.findings));
  assert("checkpointId matches spec", result.checkpointId === MOCK_SPEC.id);
  assert("checkpointName matches spec", result.checkpointName === MOCK_SPEC.name);
  assert("execution.model is a string", typeof result.execution.model === "string");
  assert("execution.executionTimeMs is a number", typeof result.execution.executionTimeMs === "number");
  assert("execution.timestamp is an ISO string", !isNaN(Date.parse(result.execution.timestamp)));
  assert("FRAMEWORK_VERSION is non-empty", typeof FRAMEWORK_VERSION === "string" && FRAMEWORK_VERSION.length > 0);

  if (result.status === "completed" && result.findings.length > 0) {
    const f = result.findings[0];
    assert("finding[0].criterionId is a string", typeof f.criterionId === "string");
    assert("finding[0].title is a string", typeof f.title === "string");
    assert("finding[0].severity is valid", ["critical", "warning", "info"].includes(f.severity));
    assert("finding[0].evidence is an array", Array.isArray(f.evidence));
  }

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`═══════════════════════════════════════════════════\n`);

  if (failed > 0) {
    Deno.exit(1);
  }
}

// ─── Entry Point ─────────────────────────────────────────────────

runSmokeTest();
