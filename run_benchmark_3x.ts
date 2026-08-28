import fs from "fs";
import { localCodeVibeTask as codeVibeTask } from "./local_eval_task.ts";

const filename = "./eval_braintrust_100_cases.json";
const data = JSON.parse(fs.readFileSync(filename, "utf-8"));

async function runOneTime(tc: any, runNum: number) {
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
    
    return {
      run: runNum,
      verdict: output.verdict,
      findingCount,
      classes: actualClasses.sort(),
      severities: actualSeverities.sort(),
      error: null
    };
  } catch (err: any) {
    return {
      run: runNum,
      error: err.message
    };
  }
}

async function main() {
  const results: Record<string, any> = {};
  
  for (const tc of data) {
    console.log(`Evaluating ${tc.id}...`);
    results[tc.id] = {
      id: tc.id,
      expected: tc.expected,
      runs: []
    };
    
    for (let i = 1; i <= 3; i++) {
      const res = await runOneTime(tc, i);
      results[tc.id].runs.push(res);
    }
  }

  fs.writeFileSync("benchmark_new_3x_results.json", JSON.stringify(results, null, 2));
  console.log("Done.");
}

main().catch(console.error);
