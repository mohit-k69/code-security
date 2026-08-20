// ─── Report Generator Unit Tests ────────────────────────────────
// Verifies deterministic report generation, severity grouping,
// verdict computation, and coverage metrics.

import { ReportGenerator } from "../ReportGenerator.ts";
import { VulnerabilityClass } from "../../types/VulnerabilityClass.ts";
import type { CheckpointResult } from "../../../services/CheckpointRunner.ts";
import type { AggregatedFinding } from "../../aggregator/types.ts";
import type { RepositoryContext } from "../types.ts";

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

function makeResult(
  id: string,
  name: string,
  verdict: "PASS" | "FAIL" | "NOT_VERIFIED",
  confidence: number,
  findingCount: number,
  status: "completed" | "error" = "completed",
  error?: string,
  applicability: "APPLICABLE" | "NOT_APPLICABLE" | "UNKNOWN" = "UNKNOWN"
): CheckpointResult {
  const findings = Array.from({ length: findingCount }, (_, i) => ({
    findingId: `${id}-f${i}`,
    criterionId: `${id}-C${i}`,
    vulnerabilityClass: "SECURITY_CONFIGURATION" as VulnerabilityClass,
    cwes: [],
    primaryLocation: { file: "src/app.ts", line: 10 + i },
    title: `Finding ${i}`,
    severity: "warning" as const,
    description: `Desc ${i}`,
    suggestion: `Fix ${i}`,
    evidence: [{ file: "src/app.ts", line: 10 + i, snippet: "code", explanation: "reason" }],
  }));

  return {
    checkpointId: id,
    checkpointName: name,
    verdict,
    applicability,
    confidence,
    summary: `Summary for ${id}`,
    findings,
    status,
    ...(error ? { error } : {}),
    execution: { executionTimeMs: 500, llmDurationMs: 450, model: "test", timestamp: "2026-01-01T00:00:00Z" },
  };
}

function makeFinding(
  id: string,
  severity: "critical" | "warning" | "info",
  file: string,
  line: number,
  vulnClass: VulnerabilityClass = VulnerabilityClass.XSS,
): AggregatedFinding {
  return {
    findingId: id,
    vulnerabilityClass: vulnClass,
    primaryLocation: { file, line },
    severity,
    confidence: 0.95,
    cwes: ["CWE-79"],
    description: `Description for ${id}`,
    suggestion: `Fix for ${id}`,
    evidence: [{ file, line, snippet: "code", explanation: "reason" }],
    contributingCheckpoints: ["SEC-AUTH-001"],
  };
}

// ─── Test Fixtures ──────────────────────────────────────────────

const MOCK_REPO_CTX: RepositoryContext = {
  owner: "acme-corp",
  name: "web-app",
  prNumber: 42,
  commitSha: "abc123def456",
};

const generator = new ReportGenerator();

console.log("\n═══════════════════════════════════════════════════");
console.log("  Report Generator Unit Tests");
console.log("═══════════════════════════════════════════════════\n");

// ── Test 1: Overall Verdict — FAIL wins ─────────────────────────
console.log("── Test 1: Overall verdict — FAIL wins ──");
{
  const results = [
    makeResult("CP1", "Auth", "PASS", 0.9, 0),
    makeResult("CP2", "XSS", "FAIL", 0.8, 1),
    makeResult("CP3", "Config", "PASS", 0.95, 0),
  ];
  const report = generator.generate(results, [], 10, MOCK_REPO_CTX);
  assert(report.verdict === "FAIL", "FAIL checkpoint should escalate overall verdict to FAIL");
}

// ── Test 2: Overall Verdict — NOT_VERIFIED when no FAIL ─────────
console.log("\n── Test 2: Overall verdict — NOT_VERIFIED fallback ──");
{
  const results = [
    makeResult("CP1", "Auth", "PASS", 0.9, 0),
    makeResult("CP2", "XSS", "NOT_VERIFIED", 0, 0, "error", "Timeout"),
  ];
  const report = generator.generate(results, [], 10, MOCK_REPO_CTX);
  assert(report.verdict === "NOT_VERIFIED", "NOT_VERIFIED should surface when no FAIL exists but some are unverified");
}

// ── Test 3: Overall Verdict — Clean PASS ────────────────────────
console.log("\n── Test 3: Overall verdict — clean PASS ──");
{
  const results = [
    makeResult("CP1", "Auth", "PASS", 0.99, 0),
    makeResult("CP2", "XSS", "PASS", 0.95, 0),
  ];
  const report = generator.generate(results, [], 10, MOCK_REPO_CTX);
  assert(report.verdict === "PASS", "All PASS should produce overall PASS");
}

// ── Test 4: Overall Verdict — GitHub Empty results ────────────────
console.log("\n── Test 4: Overall verdict — GitHub empty results ──");
{
  const report = generator.generate([], [], 10, MOCK_REPO_CTX);
  assert(report.verdict === "NOT_VERIFIED", "GitHub: No results should produce NOT_VERIFIED");
}

// ── Test 5: Checkpoint Summaries ────────────────────────────────
console.log("\n── Test 5: Checkpoint summaries ──");
{
  const results = [
    makeResult("CP1", "Auth", "PASS", 0.9, 0),
    makeResult("CP2", "XSS", "FAIL", 0.8, 2),
  ];
  const report = generator.generate(results, [], 10, MOCK_REPO_CTX);
  assert(report.checkpoints.length === 2, "Should have 2 checkpoint summaries");
  assert(report.checkpoints[0].checkpointId === "CP1", "First checkpoint ID matches");
  assert(report.checkpoints[0].checkpointName === "Auth", "First checkpoint name matches");
  assert(report.checkpoints[0].verdict === "PASS", "First checkpoint verdict matches");
  assert(report.checkpoints[0].findingCount === 0, "First checkpoint finding count is 0");
  assert(report.checkpoints[1].findingCount === 2, "Second checkpoint finding count is 2");
  assert(report.checkpoints[1].executionTimeMs === 500, "Execution time is captured");
}

// ── Test 6: Error propagation in checkpoint summary ─────────────
console.log("\n── Test 6: Error propagation ──");
{
  const results = [
    makeResult("CP1", "Auth", "NOT_VERIFIED", 0, 0, "error", "Provider timeout"),
  ];
  const report = generator.generate(results, [], 10, MOCK_REPO_CTX);
  assert(report.checkpoints[0].status === "error", "Error status propagated");
  assert(report.checkpoints[0].error === "Provider timeout", "Error message propagated");
}

// ── Test 7: Findings grouped by severity ────────────────────────
console.log("\n── Test 7: Findings grouped by severity ──");
{
  const findings: AggregatedFinding[] = [
    makeFinding("f1", "critical", "src/auth.ts", 10),
    makeFinding("f2", "warning", "src/api.ts", 20),
    makeFinding("f3", "info", "src/utils.ts", 30),
    makeFinding("f4", "critical", "src/db.ts", 5),
    makeFinding("f5", "warning", "src/api.ts", 15),
  ];
  const report = generator.generate([], findings, 10, MOCK_REPO_CTX);
  assert(report.findings.critical.length === 2, "2 critical findings");
  assert(report.findings.warning.length === 2, "2 warning findings");
  assert(report.findings.info.length === 1, "1 info finding");
  assert(report.totalFindings === 5, "Total findings is 5");
}

// ── Test 8: Deterministic sort within severity buckets ──────────
console.log("\n── Test 8: Deterministic sort within severity buckets ──");
{
  const findings: AggregatedFinding[] = [
    makeFinding("f1", "critical", "src/z.ts", 100),
    makeFinding("f2", "critical", "src/a.ts", 50),
    makeFinding("f3", "critical", "src/a.ts", 10),
  ];
  const report = generator.generate([], findings, 10, MOCK_REPO_CTX);
  assert(report.findings.critical[0].primaryLocation.file === "src/a.ts", "Sorted by file first");
  assert(report.findings.critical[0].primaryLocation.line === 10, "Then by line ascending");
  assert(report.findings.critical[1].primaryLocation.line === 50, "Second a.ts finding");
  assert(report.findings.critical[2].primaryLocation.file === "src/z.ts", "z.ts last");
}

// ── Test 9: Coverage summary ────────────────────────────────────
console.log("\n── Test 9: Coverage summary ──");
{
  const results = [
    makeResult("CP1", "Auth", "PASS", 0.9, 0),
    makeResult("CP2", "XSS", "FAIL", 0.8, 1),
    makeResult("CP3", "Config", "NOT_VERIFIED", 0, 0, "error"),
  ];
  const report = generator.generate(results, [], 10, MOCK_REPO_CTX);
  assert(report.coverage.totalCheckpoints === 10, "Total matches registry count");
  assert(report.coverage.executedCheckpoints === 3, "3 executed");
  assert(report.coverage.skippedCheckpoints === 7, "7 skipped (10 - 3)");
  assert(report.coverage.notVerifiedCheckpoints === 1, "1 not verified");
}

// ── Test 10: ReportFinding shape ────────────────────────────────
console.log("\n── Test 10: ReportFinding shape ──");
{
  const findings: AggregatedFinding[] = [
    makeFinding("f1", "critical", "src/auth.ts", 42, VulnerabilityClass.AUTH_BYPASS),
  ];
  findings[0].contributingCheckpoints = ["SEC-AUTH-001", "SEC-CONFIG-001"];
  findings[0].cwes = ["CWE-287", "CWE-863"];

  const report = generator.generate([], findings, 10, MOCK_REPO_CTX);
  const rf = report.findings.critical[0];
  assert(rf.findingId === "f1", "Finding ID preserved");
  assert(rf.vulnerabilityClass === VulnerabilityClass.AUTH_BYPASS, "VulnerabilityClass preserved");
  assert(rf.primaryLocation.file === "src/auth.ts", "Primary location file preserved");
  assert(rf.primaryLocation.line === 42, "Primary location line preserved");
  assert(rf.suggestion === "Fix for f1", "Suggestion preserved");
  assert(rf.cwes.length === 2, "CWEs preserved");
  assert(rf.contributingCheckpoints.length === 2, "Contributing checkpoints preserved");
  assert(rf.title.includes("AUTH_BYPASS"), "Title includes vulnerability class");
  assert(rf.title.includes("src/auth.ts"), "Title includes file");
}

// ── Test 11: No duplicate findings ──────────────────────────────
console.log("\n── Test 11: No duplicate findings across severity groups ──");
{
  const findings: AggregatedFinding[] = [
    makeFinding("unique-1", "critical", "a.ts", 1),
    makeFinding("unique-2", "warning", "b.ts", 2),
    makeFinding("unique-3", "info", "c.ts", 3),
  ];
  const report = generator.generate([], findings, 10, MOCK_REPO_CTX);
  const allIds = [
    ...report.findings.critical.map(f => f.findingId),
    ...report.findings.warning.map(f => f.findingId),
    ...report.findings.info.map(f => f.findingId),
  ];
  const uniqueIds = new Set(allIds);
  assert(allIds.length === uniqueIds.size, "No duplicate finding IDs across severity groups");
}

// ── Test 12: generatedAt is present ─────────────────────────────
console.log("\n── Test 12: Timestamp ──");
{
  const report = generator.generate([], [], 10, MOCK_REPO_CTX);
  assert(typeof report.generatedAt === "string", "generatedAt is a string");
  assert(report.generatedAt.length > 0, "generatedAt is not empty");
}

// ── Test 13: scanId is present ──────────────────────────────────
console.log("\n── Test 13: scanId ──");
{
  const report = generator.generate([], [], 10, MOCK_REPO_CTX);
  assert(typeof report.scanId === "string", "scanId is a string");
  assert(report.scanId.startsWith("scan_acme-corp_web-app_pr42_"), "scanId contains repo context");
}

// ── Test 14: repository context is preserved ────────────────────
console.log("\n── Test 14: Repository context ──");
{
  const report = generator.generate([], [], 10, MOCK_REPO_CTX);
  assert(report.repository.owner === "acme-corp", "Owner preserved");
  assert(report.repository.name === "web-app", "Repo name preserved");
  assert(report.repository.prNumber === 42, "PR number preserved");
  assert(report.repository.commitSha === "abc123def456", "Commit SHA preserved");
}

// ── Test 15: Paste Code — Clean snippet with irrelevant NOT_VERIFIED ──
console.log("\n── Test 15: Paste Code — Clean snippet with irrelevant NOT_VERIFIED ──");
{
  const PASTE_CTX = { ...MOCK_REPO_CTX, commitSha: "local", name: "paste_snippet" };
  const results = [
    makeResult("CP1", "Auth", "NOT_VERIFIED", 0, 0, "completed", undefined, "NOT_APPLICABLE"),
    makeResult("CP2", "Config", "PASS", 0.9, 0, "completed", undefined, "NOT_APPLICABLE"),
  ];
  // No findings (findings = [])
  const report = generator.generate(results, [], 10, PASTE_CTX);
  assert(report.verdict === "PASS", "Paste Code: Irrelevant NOT_VERIFIED with NOT_APPLICABLE -> PASS");
}

// ── Test 16: Paste Code — SQL injection -> FAIL ──
console.log("\n── Test 16: Paste Code — SQL injection -> FAIL ──");
{
  const PASTE_CTX = { ...MOCK_REPO_CTX, commitSha: "local", name: "paste_snippet" };
  const results = [
    makeResult("CP1", "SQLi", "FAIL", 0.9, 1, "completed", undefined, "APPLICABLE"),
    makeResult("CP2", "Auth", "NOT_VERIFIED", 0, 0, "completed", undefined, "NOT_APPLICABLE"),
  ];
  const findings: AggregatedFinding[] = [
    makeFinding("f1", "critical", "snippet.js", 5, VulnerabilityClass.SQL_INJECTION)
  ];
  const report = generator.generate(results, findings, 10, PASTE_CTX);
  assert(report.verdict === "FAIL", "Paste Code: Concrete FAIL finding -> FAIL");
}

// ── Test 17: Paste Code — Unresolved context -> NOT_VERIFIED ──
console.log("\n── Test 17: Paste Code — Unresolved context -> NOT_VERIFIED ──");
{
  const PASTE_CTX = { ...MOCK_REPO_CTX, commitSha: "local", name: "paste_snippet" };
  const results = [
    makeResult("CP1", "Authz", "NOT_VERIFIED", 0, 0, "completed", undefined, "APPLICABLE"),
    makeResult("CP2", "Config", "PASS", 0.9, 0, "completed", undefined, "NOT_APPLICABLE"),
  ];
  const findings: AggregatedFinding[] = [];
  const report = generator.generate(results, findings, 10, PASTE_CTX);
  assert(report.verdict === "NOT_VERIFIED", "Paste Code: APPLICABLE + NOT_VERIFIED -> NOT_VERIFIED");
}

// ── Test 18: Paste Code — Explicit Auth Bypass -> FAIL ──
console.log("\n── Test 18: Paste Code — Explicit Auth Bypass -> FAIL ──");
{
  const PASTE_CTX = { ...MOCK_REPO_CTX, commitSha: "local", name: "paste_snippet" };
  const results = [
    makeResult("CP1", "Auth", "FAIL", 0.95, 1, "completed", undefined, "APPLICABLE"),
  ];
  const findings: AggregatedFinding[] = [
    makeFinding("f1", "critical", "snippet.js", 5, VulnerabilityClass.AUTH_BYPASS)
  ];
  const report = generator.generate(results, findings, 10, PASTE_CTX);
  assert(report.verdict === "FAIL", "Paste Code: Explicit authentication bypass -> FAIL");
}

// ── Test 18: Paste Code — UNKNOWN + NOT_VERIFIED -> NOT_VERIFIED ──
console.log("\n── Test 18: Paste Code — UNKNOWN + NOT_VERIFIED -> NOT_VERIFIED ──");
{
  const PASTE_CTX = { ...MOCK_REPO_CTX, commitSha: "local", name: "paste_snippet" };
  const results = [
    makeResult("CP1", "Config", "NOT_VERIFIED", 0, 0, "completed", undefined, "UNKNOWN"),
  ];
  const report = generator.generate(results, [], 10, PASTE_CTX);
  assert(report.verdict === "NOT_VERIFIED", "Paste Code: UNKNOWN applicability with NOT_VERIFIED -> NOT_VERIFIED");
}

// ── Test 19: Paste Code — 0 Checkpoints -> PASS ──
console.log("\n── Test 19: Paste Code — 0 Checkpoints -> PASS ──");
{
  const PASTE_CTX = { ...MOCK_REPO_CTX, commitSha: "local", name: "paste_snippet" };
  const report = generator.generate([], [], 10, PASTE_CTX);
  assert(report.verdict === "PASS", "Paste Code: 0 checkpoints + 0 findings -> PASS");
}

// ─── Summary ────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════════════════\n");

if (failed > 0) {
  process.exit(1);
}

