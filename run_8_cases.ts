import fs from "fs";
import { localCodeVibeTask as codeVibeTask } from "./local_eval_task.ts";

const filename = "./eval_braintrust_100_cases.json";
const data = JSON.parse(fs.readFileSync(filename, "utf-8"));

const targetIds = ['tc_023', 'tc_024', 'tc_025', 'tc_026', 'tc_083', 'tc_084', 'tc_087', 'tc_088'];
const targetCases = data.filter((tc: any) => targetIds.includes(tc.id));

async function main() {
  for (const tc of targetCases) {
    console.log(`Evaluating ${tc.id}...`);
    try {
      const output = await codeVibeTask(tc.snippet);
      console.log(`ID: ${tc.id} | Expected: ${tc.expected.verdict} | Actual: ${output.verdict}`);
    } catch (err: any) {
      console.error(`Error in ${tc.id}: ${err.message}`);
    }
  }
}

main().catch(console.error);
