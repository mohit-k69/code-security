import { FindingAggregator } from "../supabase/functions/analyze-repository/orchestrator/aggregator/FindingAggregator.ts";
import fs from "fs";

// Mock Deno test environment
let tests = [];
globalThis.Deno = {
  test: (name, fn) => {
    tests.push({ name, fn });
  }
};

globalThis.assertEquals = (actual, expected, msg) => {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${msg} - expected ${expected}, got ${actual}`);
  }
};

function createFinding(id, vulnerabilityClass, title, description, file, line, snippet, cwes = []) {
  return {
    findingId: id,
    vulnerabilityClass,
    title,
    description,
    primaryLocation: { file, line },
    severity: "warning",
    evidence: [{ file, line, snippet, explanation: "ev" }],
    suggestion: "suggest",
    cwes
  };
}

function wrapFinding(finding) {
  return {
    checkpointId: "TEST",
    checkpointName: "TEST",
    verdict: "FAIL",
    applicability: "APPLICABLE",
    confidence: 0.9,
    summary: "sum",
    findings: [finding],
    status: "success",
    execution: { executionTimeMs: 1, llmDurationMs: 1, model: "m", timestamp: "t" }
  };
}
globalThis.createFinding = createFinding;
globalThis.wrapFinding = wrapFinding;

async function run() {
  await import("../supabase/functions/analyze-repository/orchestrator/aggregator/__tests__/FindingAggregator.test.ts");
  
  let passed = 0;
  let failed = 0;
  
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✅ ${t.name}`);
      passed++;
    } catch (e) {
      console.error(`❌ ${t.name}`);
      console.error(`   ${e.message}`);
      failed++;
    }
  }
  
  console.log(`\nTests completed. Passed: ${passed}, Failed: ${failed}`);
}

run();
