import fs from 'fs';
const data = JSON.parse(fs.readFileSync('./eval_braintrust_100_cases.json', 'utf-8'));
const ids = ["tc_012", "tc_021", "tc_041", "tc_042", "tc_043", "tc_093"];
for (const tc of data) {
  if (ids.includes(tc.id)) {
    console.log(`\n=== ${tc.id} ===`);
    console.log(tc.snippet);
    console.log(`Expected: ${tc.expected.vulnerabilityClasses[0]}`);
    console.log(`Rationale: ${tc.rationale}`);
  }
}
