import "jsr:@std/dotenv/load";
import { CheckpointRunner } from "./supabase/functions/analyze-repository/services/CheckpointRunner.ts";
import { CHECKPOINT_REGISTRY } from "./supabase/functions/analyze-repository/orchestrator/registry/CheckpointRegistry.ts";
import { OpenRouterProvider } from "./supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";
import { SECURITY_REVIEW_FRAMEWORK } from "./supabase/functions/analyze-repository/prompts/SecurityReviewFramework.ts";
import dataset from "./eval_braintrust_30_cases.json" with { type: "json" };

async function run() {
  const provider = new OpenRouterProvider("google/gemini-3.1-flash-lite");
  const cp = CHECKPOINT_REGISTRY.find(c => c.id === "SEC-SECRET-001");
  const spec = cp!.spec;
  const runner = new CheckpointRunner(provider);
  const tc = dataset.find((c: any) => c.id === 'tc_028');
  
  const ctx = {
    repository: "local/paste_snippet",
    prNumber: 1,
    commitSha: "s",
    changedFiles: [{ path: "snippet.js", content: tc.snippet, deleted: false }],
    dependencies: []
  };
  
  for (let i = 1; i <= 5; i++) {
    const res = await runner.run(ctx as any, SECURITY_REVIEW_FRAMEWORK, spec);
    console.log(`\n--- RUN ${i} ---`);
    console.log(`Raw SECRET_EXPOSURE findings: ${res.findings?.length || 0}`);
    
    if (res.findings && res.findings.length > 0) {
      res.findings.forEach((f: any, idx: number) => {
        console.log(` Finding ${idx + 1}: ${f.findingId}`);
        console.log(`   Lines: ${f.evidence?.map((e: any) => e.line).join(", ")}`);
        console.log(`   Evidence Snippets:`);
        f.evidence?.forEach((e: any) => console.log(`      - ${e.snippet}`));
      });
    } else {
      console.log(`  No findings returned.`);
    }
  }
}
run();
