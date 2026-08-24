const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Desktop/code-security/eval_braintrust_30_cases.json', 'utf8'));

const passCases = data.filter(d => d.expected.verdict === "PASS");
console.log(`Total PASS cases: ${passCases.length}`);
passCases.forEach(c => console.log(`${c.id}: ${c.category} - ${c.tags.join(',')}`));
