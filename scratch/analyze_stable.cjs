const fs = require('fs');
const stableFailures = [
  "tc_013", "tc_015", "tc_037", "tc_038", "tc_040", "tc_041", "tc_042", "tc_043",
  "tc_044", "tc_047", "tc_048", "tc_063", "tc_065", "tc_069", "tc_076", "tc_077",
  "tc_079", "tc_080", "tc_085", "tc_086", "tc_089", "tc_091", "tc_092", "tc_093",
  "tc_098"
];

const braintrust = JSON.parse(fs.readFileSync('eval_braintrust_100_cases.json', 'utf8'));
const failureTrace = JSON.parse(fs.readFileSync('scratch/failure_trace.json', 'utf8'));
const run3 = JSON.parse(fs.readFileSync('run3_results.json', 'utf8'));

let md = "# Stable Failures Draft\n\n";

for (const id of stableFailures) {
  const tc = braintrust.find(c => c.id === id);
  const expected = tc.expected;
  const trace = failureTrace.find(t => t.id === id) || { actualVerdict: "UNKNOWN", rawFindings: [], finalFindings: [] };
  
  md += `## Case: ${id}\n`;
  md += `**Category/Tags**: ${tc.category} / ${tc.tags.join(",")}\n`;
  md += `**Rationale**: ${tc.rationale}\n`;
  md += `**Snippet**:\n\`\`\`javascript\n${tc.snippet}\n\`\`\`\n`;
  md += `**Expected**: Verdict=${expected.verdict}, Count=${expected.findingCount}, Classes=${expected.vulnerabilityClasses.join(",")}\n`;
  md += `**Actual**: Verdict=${trace.actualVerdict}, Classes=${(trace.finalFindings || []).map(f=>f.title).join(",")}\n`;
  md += `**Raw Findings**: ${JSON.stringify((trace.rawFindings || []).map(f => f.title))}\n\n`;
}

fs.writeFileSync('scratch/analysis_draft.md', md);
console.log("Draft written to scratch/analysis_draft.md");
