const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Desktop/code-security/eval_braintrust_30_cases.json', 'utf8'));
let zeros = 0;
data.forEach(c => {
  if (c.expected.findingCount === 0) zeros++;
});
console.log(`Cases with 0 findings: ${zeros}`);
