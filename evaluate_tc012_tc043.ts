import { localCodeVibeTask } from "./local_eval_task.ts";
import { readFileSync } from "fs";

async function main() {
  const data = JSON.parse(readFileSync("eval_braintrust_100_cases.json", "utf-8"));
  for (const tc of data) {
    if (tc.id === "tc_012" || tc.id === "tc_043") {
      console.log(`\n================================\nEvaluating ${tc.id}...\n================================`);
      const result = await localCodeVibeTask(tc.snippet);
      console.log("Verdict:", result.verdict);
      console.log("Checkpoints:");
      for (const cp of result.checkpoints) {
        console.log(`  - ${cp.checkpointId}: ${cp.verdict}`);
      }
    }
  }
}

main().catch(console.error);
