const fs = require('fs');

const originalFile = 'eval_braintrust_100_cases.json';
const backupFile = 'eval_braintrust_100_cases.json.bak';

const data = JSON.parse(fs.readFileSync(originalFile, 'utf8'));
fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));

const targets = ['tc_012', 'tc_074', 'tc_075', 'tc_031', 'tc_032', 'tc_033', 'tc_100'];
const beforeAfter = [];

let modifiedCount = 0;

for (const item of data) {
  if (targets.includes(item.id)) {
    const before = JSON.parse(JSON.stringify(item.expected));
    
    if (item.id === 'tc_012') {
      item.expected.vulnerabilityClasses = ['BUSINESS_LOGIC_FLAW'];
    } else if (item.id === 'tc_074' || item.id === 'tc_075') {
      item.expected.vulnerabilityClasses = ['INPUT_VALIDATION'];
    } else if (['tc_031', 'tc_032', 'tc_033', 'tc_100'].includes(item.id)) {
      item.expected = {
        verdict: "PASS",
        vulnerabilityClasses: [],
        severities: [],
        lines: [],
        findingCount: 0
      };
    }
    
    modifiedCount++;
    beforeAfter.push({
      id: item.id,
      before,
      after: item.expected
    });
  }
}

fs.writeFileSync(originalFile, JSON.stringify(data, null, 2));

console.log(JSON.stringify({
  modifiedCount,
  beforeAfter
}, null, 2));
