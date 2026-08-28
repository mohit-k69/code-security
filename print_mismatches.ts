import fs from "fs";

const data = JSON.parse(fs.readFileSync("eval_braintrust_100_cases.json", "utf-8"));
const mismatches = JSON.parse(fs.readFileSync("mismatches.json", "utf-8"));

for (const m of mismatches) {
  const tc = data.find((d: any) => d.id === m.id);
  console.log(`\n================================`);
  console.log(`ID: ${m.id} | Stability: ${m.stability}`);
  console.log(`Expected: ${m.expectedVerdict} | Rationale: ${tc.rationale}`);
  console.log(`Actual Runs:`);
  m.runs.forEach((r: any, i: number) => {
    console.log(`  Run ${i+1}: ${r.verdict} (${r.classes.join(", ")})`);
  });
  console.log(`Snippet:\n${tc.snippet}`);
}
