import fs from 'fs';
import { localCodeVibeTask as codeVibeTask } from "./local_eval_task.ts";

const filename = "./eval_braintrust_100_cases.json";
const data = JSON.parse(fs.readFileSync(filename, 'utf-8'));

const targetIds = ['tc_042', 'tc_044', 'tc_093'];
const targets = data.filter((tc: any) => targetIds.includes(tc.id));

async function run() {
  for (const tc of targets) {
    console.log(`\n\n======================================================`);
    console.log(`EVALUATING ${tc.id}`);
    console.log(`EXPECTED: ${JSON.stringify(tc.expected, null, 2)}`);
    console.log(`SNIPPET:\n${tc.snippet}`);
    console.log(`======================================================\n`);
    
    try {
      const output = await codeVibeTask(tc.snippet);
      console.log(`\nFINAL AGGREGATED OUTPUT:`);
      console.log(JSON.stringify(output, null, 2));
    } catch (e: any) {
      console.error(`ERROR: ${e.message}`);
    }
  }
}

run().catch(console.error);
