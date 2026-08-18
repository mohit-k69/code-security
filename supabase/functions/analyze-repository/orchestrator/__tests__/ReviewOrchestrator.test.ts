// ─── Review Orchestrator Integration Tests ─────────────────────
// Validates the complete pipeline using a mock LLM provider.
// No real API calls. Deterministic. Fast.

import { ReviewOrchestrator } from "../ReviewOrchestrator.ts";
import type { ILLMProvider } from "../providers/ILLMProvider.ts";
import { ProviderError } from "../providers/ProviderError.ts";
import type { SanitizedContextPackage } from "../../services/types.ts";
import type { RoutingRule } from "../router/types.ts";

// ─── Test Helpers ───────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  }
}

function makeSanitizedPackage(files: string[]): SanitizedContextPackage {
  return {
    repository: "acme-corp/web-app",
    prNumber: 42,
    commitSha: "abc123",
    changedFiles: files.map((f) => ({
      path: f,
      content: "// mock content",
      deleted: false,
    })),
    dependencies: [],
    metadata: {
      totalSecretsReplaced: 0,
      replacementTypes: {},
      ignoredReplacements: 0,
      processingTimeMs: 0,
    },
  };
}

/**
 * A mock LLM provider that returns a valid checkpoint JSON response.
 * Simulates a real provider without making any API calls.
 */
class MockProvider implements ILLMProvider {
  public readonly name = "mock";
  public callCount = 0;

  public async generateContent(systemPrompt: string, userPrompt: string, model?: string): Promise<any> {
    this.callCount++;
    return {
      text: JSON.stringify({
        verdict: "PASS",
        confidence: 0.95,
        summary: "No vulnerabilities found.",
        findings: []
      }),
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
    };
  }
}

/**
 * A mock provider that returns findings for testing aggregation.
 */
class MockProviderWithFindings implements ILLMProvider {
  public readonly name = "mock-findings";

  public async generateContent(systemPrompt: string, userPrompt: string, model?: string): Promise<any> {
    return {
      text: JSON.stringify({
        verdict: "FAIL",
        confidence: 0.88,
        summary: "Found duplicate issues.",
        findings: [
          {
            criterionId: "MOCK-C1",
            vulnerabilityClass: "AUTH_BYPASS",
            primaryLocation: { file: "test.js", line: 10 },
            title: "Mock finding",
            severity: "critical",
            description: "Mock duplicate finding.",
            suggestion: "Fix it.",
            evidence: []
          }
        ]
      }),
      usage: { promptTokens: 120, completionTokens: 60, totalTokens: 180 }
    };
  }
}

/**
 * A mock provider that always throws (simulates timeout/failure).
 */
class FailingProvider implements ILLMProvider {
  public readonly name = "failing";

  public async generateContent(systemPrompt: string, userPrompt: string, model?: string): Promise<any> {
    throw new ProviderError("TIMEOUT", this.name, "Mock timeout error");
  }
}

/**
 * A mock provider that fails on the Nth call.
 */
class PartiallyFailingProvider implements ILLMProvider {
  public readonly name = "partial-fail";
  private callCount = 0;
  private failOnCall: number;

  constructor(failOnCall: number) {
    this.failOnCall = failOnCall;
  }

  public async generateContent(systemPrompt: string, userPrompt: string, model?: string): Promise<any> {
    this.callCount++;
    if (this.callCount === this.failOnCall) {
      throw new ProviderError("UNAVAILABLE", this.name, "Mock random failure");
    }
    return {
      text: JSON.stringify({
        verdict: "PASS",
        confidence: 0.99,
        summary: "Success",
        findings: []
      }),
      usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 }
    };
  }
}

// ─── Tests ──────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════");
console.log("  Review Orchestrator Integration Tests");
console.log("═══════════════════════════════════════════════════\n");

// ── Test 1: All checkpoints succeed ─────────────────────────────
console.log("── Test 1: All checkpoints succeed ──");
{
  const provider = new MockProvider();
  const orchestrator = new ReviewOrchestrator({ provider });
  // Unknown files → fail open → all checkpoints run
  const pkg = makeSanitizedPackage(["README.md"]);
  const result = await orchestrator.review(pkg); const report = result.report;

  assert(report.verdict === "PASS", "Overall verdict is PASS");
  assert(report.checkpoints.length > 0, "Checkpoint summaries present");
  assert(report.checkpoints.every((c) => c.verdict === "PASS"), "All checkpoints passed");
  assert(report.totalFindings === 0, "No findings");
  assert(report.scanId.startsWith("scan_"), "scanId is generated");
  assert(report.repository.owner === "acme-corp", "Owner extracted");
  assert(report.repository.name === "web-app", "Repo name extracted");
  assert(report.repository.prNumber === 42, "PR number preserved");
  assert(provider.callCount > 0, "Provider was actually called");
}

// ── Test 2: One checkpoint fails (partial failure) ──────────────
console.log("\n── Test 2: One checkpoint fails (partial failure) ──");
{
  const provider = new PartiallyFailingProvider(2); // 2nd checkpoint fails
  const orchestrator = new ReviewOrchestrator({ provider });
  const pkg = makeSanitizedPackage(["README.md"]); // fail open → all run
  const result = await orchestrator.review(pkg); const report = result.report;

  assert(report.checkpoints.some((c) => c.status === "error"), "Error checkpoint is included");
  assert(report.checkpoints.some((c) => c.status === "completed"), "Successful checkpoints are included");
  assert(report.coverage.notVerifiedCheckpoints >= 1, "At least 1 not verified");
  assert(typeof report.generatedAt === "string", "Report generated despite failure");
}

// ── Test 3: Router selects subset ───────────────────────────────
console.log("\n── Test 3: Router selects subset ──");
{
  const provider = new MockProvider();
  const orchestrator = new ReviewOrchestrator({ provider });
  const pkg = makeSanitizedPackage(["package.json"]); // Only supply chain
  const result = await orchestrator.review(pkg); const report = result.report;

  assert(report.coverage.executedCheckpoints < report.coverage.totalCheckpoints, "Only a subset executed");
  assert(report.coverage.skippedCheckpoints > 0, "Some checkpoints were skipped");
}

// ── Test 4: Router selects all (fail open) ──────────────────────
console.log("\n── Test 4: Router selects all (fail open) ──");
{
  const provider = new MockProvider();
  const orchestrator = new ReviewOrchestrator({ provider });
  const pkg = makeSanitizedPackage(["unknown-asset.xyz"]);
  const result = await orchestrator.review(pkg); const report = result.report;

  assert(report.coverage.executedCheckpoints === report.coverage.totalCheckpoints, "All checkpoints executed");
  assert(report.coverage.skippedCheckpoints === 0, "None skipped");
}

// ── Test 5: Duplicate findings across checkpoints ───────────────
console.log("\n── Test 5: Duplicate findings across checkpoints ──");
{
  const provider = new MockProviderWithFindings();
  // Use custom routing to trigger 2+ checkpoints that will both return
  // findings with the same vulnerabilityClass + file + line
  const customRules: RoutingRule[] = [
    { name: "A", matchPatterns: ["app"], checkpointIds: ["SEC-AUTH-001", "SEC-XSS-001"] },
  ];
  const orchestrator = new ReviewOrchestrator({ provider, routingRules: customRules });
  const pkg = makeSanitizedPackage(["src/app.ts"]);
  const result = await orchestrator.review(pkg); const report = result.report;

  // Both checkpoints return the same finding (same file, line, vulnClass)
  // The aggregator should merge them
  assert(report.totalFindings === 1, "Duplicate findings deduplicated into 1");
}

// ── Test 6: Empty repository (no files) ─────────────────────────
console.log("\n── Test 6: Empty repository (no files) ──");
{
  const provider = new MockProvider();
  const orchestrator = new ReviewOrchestrator({ provider });
  const pkg = makeSanitizedPackage([]);
  const result = await orchestrator.review(pkg); const report = result.report;

  // Empty files → fail open
  assert(report.coverage.executedCheckpoints === report.coverage.totalCheckpoints, "All executed (fail open)");
  assert(report.verdict === "PASS", "PASS with no findings on empty repo");
}

// ── Test 7: Provider timeout (all checkpoints fail) ─────────────
console.log("\n── Test 7: Provider timeout (all checkpoints fail) ──");
{
  const provider = new FailingProvider();
  const orchestrator = new ReviewOrchestrator({ provider });
  const pkg = makeSanitizedPackage(["README.md"]);
  const result = await orchestrator.review(pkg); const report = result.report;

  assert(report.verdict === "NOT_VERIFIED", "Verdict is NOT_VERIFIED when all fail");
  assert(report.checkpoints.every((c) => c.status === "error"), "All checkpoints are errors");
  assert(report.totalFindings === 0, "No findings on total failure");
  assert(typeof report.scanId === "string", "Report still has a scanId");
}

// ── Test 8: Report structure is always valid ────────────────────
console.log("\n── Test 8: Report structure is always valid ──");
{
  const provider = new MockProvider();
  const orchestrator = new ReviewOrchestrator({ provider });
  const pkg = makeSanitizedPackage(["src/auth/login.tsx"]);
  const result = await orchestrator.review(pkg); const report = result.report;

  assert("verdict" in report, "Has verdict");
  assert("checkpoints" in report, "Has checkpoints");
  assert("findings" in report, "Has findings");
  assert("coverage" in report, "Has coverage");
  assert("totalFindings" in report, "Has totalFindings");
  assert("generatedAt" in report, "Has generatedAt");
  assert("scanId" in report, "Has scanId");
  assert("repository" in report, "Has repository");
  assert(Array.isArray(report.findings.critical), "findings.critical is array");
  assert(Array.isArray(report.findings.warning), "findings.warning is array");
  assert(Array.isArray(report.findings.info), "findings.info is array");
}

// ── Test 9: Partial failures preserve successful results ────────
console.log("\n── Test 9: Partial failures preserve successful results ──");
{
  const provider = new PartiallyFailingProvider(1); // 1st call fails
  const orchestrator = new ReviewOrchestrator({ provider });
  const pkg = makeSanitizedPackage(["README.md"]); // fail open → all
  const result = await orchestrator.review(pkg); const report = result.report;

  const completed = report.checkpoints.filter((c) => c.status === "completed");
  const errors = report.checkpoints.filter((c) => c.status === "error");
  assert(completed.length > 0, "Some checkpoints completed successfully");
  assert(errors.length > 0, "Some checkpoints errored");
  assert(completed.length + errors.length === report.checkpoints.length, "Total = completed + errors");
}

// ─── Summary ────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════════════════\n");

if (failed > 0) {
  process.exit(1);
}
