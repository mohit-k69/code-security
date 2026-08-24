import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { CheckpointRunner } from "./supabase/functions/analyze-repository/services/CheckpointRunner.ts";
import { OpenRouterProvider } from "./supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";
import { CHECKPOINT_REGISTRY } from "./supabase/functions/analyze-repository/orchestrator/registry/CheckpointRegistry.ts";
import { CheckpointRouter } from "./supabase/functions/analyze-repository/orchestrator/router/CheckpointRouter.ts";
import { FindingGuardrail } from "./supabase/functions/analyze-repository/services/FindingGuardrail.ts";
import { FindingAggregator } from "./supabase/functions/analyze-repository/orchestrator/aggregator/FindingAggregator.ts";
import dataset from "./eval_braintrust_30_cases.json" with { type: "json" };

async function getProvider() {
  return new OpenRouterProvider();
}

async function runCase(id: string) {
  const tc = dataset.find((c: any) => c.id === id);
  if (!tc) return console.error("Not found:", id);

  const provider = await getProvider();
  const runner = new CheckpointRunner(provider);
  const router = new CheckpointRouter();
  const aggregator = new FindingAggregator();

  const ctx = {
    repository: "test", prNumber: 1, commitSha: "123",
    changedFiles: [{ path: "snippet.js", content: tc.snippet, deleted: false }],
    dependencies: []
  };

  const selected = router.route(ctx, CHECKPOINT_REGISTRY.map(r => r.spec));
  const framework = "You are a senior security engineer.";

  console.log(`\n================== ${id} ==================`);
  
  const allFindings = [];

  for (const cp of selected) {
    const spec = registry.getCheckpoint(cp.checkpointId);
    if (!spec) continue;

    console.log(`\n--- Checkpoint: ${spec.id} ---`);
    
    // Call the LLM directly to get raw output
    const userPrompt = (runner as any).buildUserPrompt(ctx, spec);
    let rawText = "";
    try {
      const resp = await provider.generateContent(framework, userPrompt);
      rawText = resp.text;
      console.log("RAW LLM OUTPUT:\n" + rawText.substring(0, 500) + (rawText.length > 500 ? "...\n" : "\n"));
      
      const parsed = await (runner as any).validateResponse(rawText, ctx, spec, "openrouter", Date.now(), 0, {});
      console.log("POST-GUARDRAIL VERDICT:", parsed.verdict);
      console.log("POST-GUARDRAIL FINDINGS:", parsed.findings.map(f => f.vulnerabilityClass).join(", "));
      
      allFindings.push(...parsed.findings);
      
    } catch (e: any) {
      console.log("Error running checkpoint:", e.message);
    }
  }

  const finalFindings = aggregator.aggregate(allFindings);
  console.log("\n--- AGGREGATION ---");
  console.log("FINAL FINDINGS:", finalFindings.map(f => f.vulnerabilityClass).join(", "));
}

async function main() {
  await runCase("tc_012");
  await runCase("tc_013");
  await runCase("tc_028");
  await runCase("tc_030");
}
main();
