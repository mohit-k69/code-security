import fs from "fs";
import { localCodeVibeTask as codeVibeTask } from "./local_eval_task.ts";

const filename = "./eval_braintrust_100_cases.json";
const data = JSON.parse(fs.readFileSync(filename, "utf-8"));

async function main() {
  const results: Record<string, any> = {};

  for (const tc of data) {
    console.log(`Evaluating ${tc.id}...`);
    try {
      const output = await codeVibeTask(tc.snippet);
      
      let actualClasses: string[] = [];
      let actualSeverities: string[] = [];
      let findingCount = 0;
      
      if (output.findings) {
        for (const key of Object.keys(output.findings)) {
          for (const f of output.findings[key]) {
            actualClasses.push(f.vulnerabilityClass);
            actualSeverities.push(f.severity);
            findingCount++;
          }
        }
      }
      
      results[tc.id] = {
        id: tc.id,
        expected: tc.expected,
        actual: {
          verdict: output.verdict,
          findingCount,
          classes: actualClasses,
          severities: actualSeverities,
          error: null
        }
      };
    } catch (err: any) {
      console.error(`Error in ${tc.id}: ${err.message}`);
      results[tc.id] = {
        id: tc.id,
        expected: tc.expected,
        actual: {
          error: err.message
        }
      };
    }
  }

  fs.writeFileSync("benchmark_1x_results.json", JSON.stringify(results, null, 2));
  console.log("Done.");
}

main().catch(console.error);
