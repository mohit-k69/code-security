import { localCodeVibeTask } from "./local_eval_task.ts";
import fs from "fs";

async function main() {
  const data = JSON.parse(fs.readFileSync("./eval_braintrust_100_cases.json", "utf8"));
  const testCase = data.find((c: any) => c.id === "tc_013");
  if (!testCase) {
    console.error("Test case tc_013 not found");
    process.exit(1);
  }

  console.log("Executing tc_013...");
  try {
    const result = await localCodeVibeTask(testCase);
    console.log("\nTop-level keys:", Object.keys(result));
    console.log("Overall Verdict:", result?.verdict);
    console.log("Checkpoints:");
    result?.checkpoints?.forEach((cp: any) => {
       console.log(`- ${cp.checkpointId}: ${cp.verdict}`);
    });
    console.log("Total Findings:", result?.totalFindings);
    console.log("Findings:", JSON.stringify(result?.findings, null, 2));
  } catch (err: any) {
    console.error("Local Task Failed Loudly!");
    console.error(err);
  }
  console.log("Done");
  process.exit(0);
}
main();
