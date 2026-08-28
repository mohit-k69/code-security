const fs = require('fs');

function updateFile(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let modified = 0;
  
  const tc042 = data.find(tc => tc.id === 'tc_042');
  if (tc042 && tc042.expected) {
    tc042.expected.vulnerabilityClasses = ['AUTH_BYPASS'];
    modified++;
  }
  
  const tc093 = data.find(tc => tc.id === 'tc_093');
  if (tc093 && tc093.expected) {
    tc093.expected.vulnerabilityClasses = ['AUTH_BYPASS'];
    tc093.expected.severities = ['warning'];
    modified++;
  }
  
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`Updated ${modified} cases in ${file}`);
}

updateFile('./eval_braintrust_100_cases.json');
updateFile('./eval_braintrust_30_cases.json');
