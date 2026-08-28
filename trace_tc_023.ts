import fs from "fs";
import { CheckpointRouter } from "./supabase/functions/analyze-repository/orchestrator/router/CheckpointRouter.ts";
import { getEnabledCheckpoints } from "./supabase/functions/analyze-repository/orchestrator/registry/CheckpointRegistry.ts";
import { CheckpointRunner } from "./supabase/functions/analyze-repository/services/CheckpointRunner.ts";
import { OpenRouterProvider } from "./supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";
import { SECURITY_REVIEW_FRAMEWORK } from "./supabase/functions/analyze-repository/prompts/SecurityReviewFramework.ts";

const filename = "./eval_braintrust_100_cases.json";
const data = JSON.parse(fs.readFileSync(filename, "utf-8"));
const tc023 = data.find((tc: any) => tc.id === "tc_023");

async function trace() {
  console.log("=== 1. Load tc_023 ===");
  console.log(`Loaded ${tc023.id}`);

  console.log("\n=== 2. Show exact snippet ===");
  console.log(tc023.snippet);

  const pkg = {
    repository: "local_user/paste_snippet",
    prNumber: 0,
    commitSha: "local",
    changedFiles: [{ path: "snippet.js", content: tc023.snippet, deleted: false }],
    dependencies: [],
    metadata: {}
  };

  const isPasteCode = true;
  const routingInputs = [tc023.snippet];

  console.log("\n=== 3. Routing Logic ===");
  const allCheckpoints = getEnabledCheckpoints();
  const allCheckpointIds = allCheckpoints.map(c => c.id);
  const provider = new OpenRouterProvider("openai/gpt-4o-mini");
  const router = new CheckpointRouter(allCheckpointIds, undefined, provider);
  const routingDecision = await router.route(routingInputs, isPasteCode);

  console.log("\n=== 4. Checkpoints Selected ===");
  console.log(routingDecision.selectedCheckpointIds);
  console.log("Explanation:", routingDecision.explanation);

  console.log("\n=== 5. Confirm relevant checkpoint ===");
  const selectedCheckpoints = allCheckpoints.filter(cp => routingDecision.selectedCheckpointIds.includes(cp.id));
  console.log("Actually running:");
  selectedCheckpoints.forEach(cp => console.log(cp.id));

  // Let's intercept the prompt
  console.log("\n=== 6. Prompt generated ===");
  
  // We can't access private buildUserPrompt directly, but we can override provider.generateContent
  let capturedPrompt = "";
  let capturedRawResponse = "";
  
  const mockProvider = {
    name: "MockProvider",
    generateContent: async (sys: string, user: string, model: string) => {
      capturedPrompt = user;
      // Pass to real provider
      const realResp = await provider.generateContent(sys, user, model);
      capturedRawResponse = realResp.text;
      return realResp;
    }
  };

  for (const cp of selectedCheckpoints) {
    console.log(`\n--- Running ${cp.id} ---`);
    const runner = new CheckpointRunner(mockProvider as any, "google/gemini-3.1-flash-lite");
    try {
      const result = await runner.run(pkg as any, SECURITY_REVIEW_FRAMEWORK, cp.spec);
      
      console.log(`\nDoes pasteCodeOverride exist in prompt?`, capturedPrompt.includes("Opaque/Unseen Implementation Rule"));
      console.log(`\nExact Prompt Sent to LLM:\n${capturedPrompt}`);
      console.log(`\n=== 7. Raw LLM JSON response ===\n${capturedRawResponse}`);
      console.log(`\n=== 8. CheckpointRunner result ===\nVerdict: ${result.verdict}\nFindings: ${result.findings.length}`);
    } catch (err: any) {
      console.error(err);
    }
  }
}

trace().catch(console.error);
