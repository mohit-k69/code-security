const fs = require('fs');
const data = JSON.parse(fs.readFileSync('experiment_Generalization100.json', 'utf8'));

let md = "### Evaluation Results\n\n";
md += "- **Overall Accuracy:** " + data.summary.overall + "%\n";
md += "- **Verdict Accuracy:** " + data.summary.verdict + "%\n";
md += "- **Finding Count Accuracy:** " + data.summary.findingCount + "%\n";
md += "- **Severity Accuracy:** " + data.summary.severity + "%\n";
md += "- **Vulnerability Class Accuracy:** " + data.summary.findingClass + "%\n";
md += "- **Deduplication Accuracy:** " + data.summary.deduplication + "%\n\n";

const failures = data.cases.filter(c => c.caseScore < 1 || c.error);
const runtimeErrors = failures.filter(c => c.error);
const mismatches = failures.filter(c => !c.error);

md += "### Mismatch Summary\n";
md += `- **Total Mismatches (Security/Model Failures):** ${mismatches.length}\n`;
md += `- **Total Runtime/API Errors:** ${runtimeErrors.length}\n\n`;

if (runtimeErrors.length > 0) {
  md += "#### Runtime/API Errors\n";
  runtimeErrors.forEach(c => {
    md += `- **${c.id}**: ${c.error}\n`;
  });
  md += "\n";
}

md += "#### Failing Case IDs\n";
md += mismatches.map(c => c.id).join(', ') + "\n\n";

md += "#### Mismatch Details\n";
mismatches.forEach(c => {
  md += `**Case ID:** ${c.id}\n`;
  
  if (c.expectedVerdict !== c.actualVerdict) {
    md += `- **Verdict Mismatch:** Expected \`${c.expectedVerdict}\`, Actual \`${c.actualVerdict}\`\n`;
  }
  if (c.expectedCount !== c.actualCount) {
    md += `- **Count Mismatch:** Expected \`${c.expectedCount}\`, Actual \`${c.actualCount}\`\n`;
  }
  const eClasses = (c.expectedClasses || []).join(', ') || 'None';
  const aClasses = (c.actualClasses || []).join(', ') || 'None';
  if (eClasses !== aClasses && c.actualVerdict !== 'PASS') {
    md += `- **Class Mismatch:** Expected \`[${eClasses}]\`, Actual \`[${aClasses}]\`\n`;
  }
  
  // Basic root cause analysis logic
  let rootCause = "Model failed to analyze properly.";
  if (c.expectedVerdict === 'PASS' && c.actualVerdict === 'FAIL') rootCause = "False Positive: Model incorrectly identified safe code as vulnerable.";
  else if (c.expectedVerdict === 'FAIL' && c.actualVerdict === 'PASS') rootCause = "False Negative: Model failed to detect the vulnerability.";
  else if (c.expectedCount > c.actualCount) rootCause = "Under-reporting: Model missed some vulnerabilities.";
  else if (c.expectedCount < c.actualCount) rootCause = "Over-reporting/Duplication: Model reported extra or duplicate findings.";
  else if (eClasses !== aClasses) rootCause = "Misclassification: Model incorrectly categorized the vulnerability.";
  
  md += `- **Likely Root Cause:** ${rootCause}\n\n`;
});

fs.writeFileSync('scratch/report.md', md);
console.log("Report generated at scratch/report.md");
