const fs = require('fs');
const data = JSON.parse(fs.readFileSync('eval_braintrust_100_cases.json', 'utf8'));
const tc = data.find(c => c.id === 'tc_047');
console.log(tc.snippet);
