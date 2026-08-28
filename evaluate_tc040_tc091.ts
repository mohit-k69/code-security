import { localCodeVibeTask as codeVibeTask } from "./local_eval_task.ts";
import fs from 'fs';

const filename = "./eval_braintrust_100_cases.json";
const data = JSON.parse(fs.readFileSync(filename, 'utf-8'));

const targetCases = data.filter((tc: any) => tc.id === 'tc_040' || tc.id === 'tc_091');

if (targetCases.length === 0) {
  console.error("Could not find tc_040 or tc_091");
  process.exit(1);
}

for (const tc of targetCases) {
  console.log(`\n================================`);
  console.log(`Evaluating ${tc.id}...`);
  console.log(`Expected Verdict: ${tc.expected.verdict}`);
  console.log(`Expected Classes: ${JSON.stringify(tc.expected.vulnerabilityClasses)}`);
  
  try {
    const output = await codeVibeTask(tc.snippet);
    console.log(`\nActual Verdict: ${output.verdict}`);
    console.log(`Actual Findings: ${output.totalFindings}`);
    const actualClasses = Object.values(output.findings || {}).flat().map((f: any) => f.vulnerabilityClass);
    console.log(`Actual Classes: ${JSON.stringify(actualClasses)}`);
    console.log(`Actual Severities: ${JSON.stringify(Object.values(output.findings || {}).flat().map((f: any) => f.severity))}`);
    
    console.log(`\nCheckpoints:`);
    output.checkpoints?.forEach((cp: any) => {
       console.log(`  - ${cp.checkpointId}: ${cp.verdict} (Findings: ${cp.findingCount ?? 0})`);
    });
  } catch (err: any) {
    console.error(`Case ${tc.id} failed loudly:`, err.message);
  }
}
