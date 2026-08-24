import { localCodeVibeTask } from "./braintrust_eval_local.ts";
import fs from "fs";

async function main() {
  const data = JSON.parse(fs.readFileSync("./eval_braintrust_30_cases.json", "utf8"));
  const tc = data.find((t: any) => t.id === 'tc_001');
  console.log("Executing tc_001...");
  try {
    await localCodeVibeTask(tc);
  } catch (err: any) {
    console.error("Local Task Failed Loudly!");
    console.error(err);
  }
  console.log("Done");
  process.exit(0);
}
main();
