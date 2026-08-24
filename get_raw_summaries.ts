import "jsr:@std/dotenv/load";
import { CheckpointRunner } from "./supabase/functions/analyze-repository/services/CheckpointRunner.ts";
import { AuthenticationSpec } from "./supabase/functions/analyze-repository/prompts/specifications/AuthenticationSpec.ts";
import { AuthorizationSpec } from "./supabase/functions/analyze-repository/prompts/specifications/AuthorizationSpec.ts";
import { GeminiProvider } from "./supabase/functions/analyze-repository/orchestrator/providers/GeminiProvider.ts";
import dataset from "./eval_braintrust_30_cases.json" with { type: "json" };

async function run() {
  const provider = new GeminiProvider();
  
  for (const id of ['tc_004', 'tc_012']) {
    const tc = dataset.find((c: any) => c.id === id);
    const ctx = {
      repository: { owner: "local", name: "repo", prNumber: 1, commitSha: "s" },
      changedFiles: [{ path: "snippet.js", content: tc.snippet }],
      dependencyFiles: []
    };
    
    if (id === 'tc_004') {
        const runner = new CheckpointRunner(AuthenticationSpec, provider);
        const res = await runner.run(ctx);
        console.log(`\n=== ${id} SEC-AUTH-001 ===\nSummary:`, res.summary);
    }
    
    if (id === 'tc_012') {
        const runner = new CheckpointRunner(AuthorizationSpec, provider);
        const res = await runner.run(ctx);
        console.log(`\n=== ${id} SEC-AUTHZ-001 ===\nSummary:`, res.summary);
        console.log("Findings:", JSON.stringify(res.findings, null, 2));
    }
  }
}
run();
