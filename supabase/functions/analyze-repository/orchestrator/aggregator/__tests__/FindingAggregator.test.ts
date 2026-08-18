import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { FindingAggregator } from "../FindingAggregator.ts";
import { VulnerabilityClass } from "../../types/VulnerabilityClass.ts";
import type { CheckpointResult, CheckpointFinding } from "../../../services/CheckpointRunner.ts";

function createMockFinding(id: string, severity: "critical" | "warning" | "info", cwe?: string): CheckpointFinding {
  return {
    findingId: "HASH-123", // Same hash to trigger deduplication
    criterionId: id,
    vulnerabilityClass: VulnerabilityClass.XSS,
    primaryLocation: { file: "src/app.ts", line: 42 },
    title: `Title ${id}`,
    severity,
    description: `Description ${id}`,
    suggestion: `Suggestion ${id}`,
    cwe,
    evidence: [{ file: "src/app.ts", line: 42, snippet: "console.log(x);", explanation: "Expl 1" }]
  };
}

function createMockResult(checkpointId: string, confidence: number, findings: CheckpointFinding[]): CheckpointResult {
  return {
    checkpointId,
    checkpointName: `Name ${checkpointId}`,
    verdict: "FAIL",
    confidence,
    summary: "Mock summary",
    findings,
    status: "completed",
    execution: { executionTimeMs: 100, model: "test", timestamp: "" }
  };
}

// Rewriting as a standard tsx script since Deno might not be available
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
}

console.log("Running FindingAggregator tests...");

const aggregator = new FindingAggregator();

// Setup: Checkpoint A (Low confidence, Info severity)
const findingA = createMockFinding("AUTH-C1", "info", "CWE-79");
const resultA = createMockResult("SEC-AUTH", 0.5, [findingA]);

// Setup: Checkpoint B (High confidence, Critical severity)
const findingB = createMockFinding("XSS-C1", "critical", "CWE-79");
findingB.evidence.push({ file: "src/db.ts", line: 10, snippet: "db.read()", explanation: "Trace" }); // Extra evidence
const resultB = createMockResult("SEC-XSS", 0.99, [findingB]);

const aggregated = aggregator.aggregate([resultA, resultB]);

// Tests
assert(aggregated.length === 1, "Should deduplicate 2 findings into 1");

const final = aggregated[0];
assert(final.severity === "critical", "Should pick maximum severity");
assert(final.confidence === 0.99, "Should pick maximum confidence");
assert(final.description === findingB.description, "Should pick description from highest confidence finding");
assert(final.suggestion === findingB.suggestion, "Should pick suggestion from highest confidence finding");
assert(final.evidence.length === 2, "Should union distinct evidence items");
assert(final.contributingCheckpoints.length === 2, "Should track both contributing checkpoints");
assert(final.contributingCheckpoints.includes("SEC-AUTH") && final.contributingCheckpoints.includes("SEC-XSS"), "Should list correct checkpoints");

console.log("✅ Passed: FindingAggregator correctly deterministically aggregates overlapping findings.");
console.log("🎉 All FindingAggregator tests passed!");
