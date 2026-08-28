const fs = require('fs');
const data = JSON.parse(fs.readFileSync('eval_braintrust_100_cases.json', 'utf8'));
const targets = data.filter(c => c.id === 'tc_040' || c.id === 'tc_091');
fs.writeFileSync('scratch/target_cases.json', JSON.stringify(targets, null, 2));
