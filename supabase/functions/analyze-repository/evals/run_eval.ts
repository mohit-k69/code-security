// ─── AI Eval Runner Script ─────────────────────────────────────────
// CLI script to execute the EvalRunner against a dataset.
//
// Usage:
//   GEMINI_API_KEY=<key> deno run --allow-net --allow-env supabase/functions/analyze-repository/evals/run_eval.ts

import { EvalRunner } from "./EvalRunner.ts";
import { AuthenticationEvalDataset } from "./datasets/AuthenticationEvalDataset.ts";
import { AuthenticationSpec } from "../prompts/specifications/AuthenticationSpec.ts";
import { SECURITY_REVIEW_FRAMEWORK, FRAMEWORK_VERSION } from "../prompts/SecurityReviewFramework.ts";
import { GeminiProvider } from "../orchestrator/providers/GeminiProvider.ts";

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  AI Eval Runner");
  console.log("═══════════════════════════════════════════════════\n");

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is not set. Cannot run evaluation.");
    Deno.exit(1);
  }

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
  console.log(`🔧 Model:     ${model}`);
  console.log(`📋 Framework: v${FRAMEWORK_VERSION}`);
  console.log(`📊 Dataset:   ${AuthenticationEvalDataset.checkpointId} (v${AuthenticationEvalDataset.version})`);
  console.log(`📝 Scenarios: ${AuthenticationEvalDataset.scenarios.length}`);
  console.log("\n⏳ Starting evaluation run...\n");

  const provider = new GeminiProvider(model);
  const runner = new EvalRunner(provider);
  const report = await runner.runEvaluation(
    AuthenticationEvalDataset,
    SECURITY_REVIEW_FRAMEWORK,
    AuthenticationSpec
  );

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Evaluation Report");
  console.log("═══════════════════════════════════════════════════\n");

  console.log(`  Overall Accuracy:    ${report.metrics.detectionAccuracy.toFixed(1)}%`);
  console.log(`  Verdict Match:       ${report.metrics.verdictAccuracy.toFixed(1)}%`);
  console.log(`  Grounding Score:     ${report.metrics.averageGroundingAccuracy.toFixed(1)}%`);
  console.log(`  Total FP / FN:       ${report.metrics.totalFalsePositives} / ${report.metrics.totalFalseNegatives}`);
  console.log(`  Avg Execution Time:  ${Math.round(report.metrics.averageExecutionTimeMs)}ms`);
  
  console.log("\n─── Scenario Breakdown ────────────────────────────\n");
  
  for (const s of report.scenarioResults) {
    const status = s.success ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${status} | ${s.scenarioId} | V: ${s.actualVerdict} (Expected ${s.expectedVerdict}) | FP: ${s.falsePositives} | FN: ${s.falseNegatives} | Grounding: ${s.groundingScore.toFixed(0)}%`);
    if (s.error) {
      console.log(`           ERROR: ${s.error}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════\n");

  // Output full report to a file could be added here
  
  if (report.metrics.failedScenarios > 0) {
    Deno.exit(1);
  }
}

main();
