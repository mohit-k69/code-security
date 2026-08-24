const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Downloads/trace_10fa79fee2e12cb20407ce0b18419803.json', 'utf8'));

console.log('| Case ID | Expected Verdict | Actual Verdict |');
console.log('|---|---|---|');

for (const item of data) {
  if (item.span_attributes && item.span_attributes.name === 'Verdict Accuracy') {
    if (item.scores && item.scores['Verdict Accuracy'] === 0) {
      const caseId = item.input?.id || 'Unknown';
      const expectedVerdict = item.input?.expected?.['expected.verdict'] || 'Unknown';
      const actualVerdict = item.input?.output?.verdict || 'Unknown';
      console.log(`| ${caseId} | ${expectedVerdict} | ${actualVerdict} |`);
    }
  }
}
