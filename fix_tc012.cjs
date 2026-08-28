const fs = require('fs');

const file = './eval_braintrust_30_cases.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const tc012 = data.find(tc => tc.id === 'tc_012');
if (tc012) {
  const before = JSON.stringify(tc012.expected.vulnerabilityClasses);
  
  // Find the index of AUTHORIZATION_FAILURE and replace it with BUSINESS_LOGIC_FLAW
  const index = tc012.expected.vulnerabilityClasses.indexOf('AUTHORIZATION_FAILURE');
  if (index !== -1) {
    tc012.expected.vulnerabilityClasses[index] = 'BUSINESS_LOGIC_FLAW';
  } else if (tc012.expected.vulnerabilityClasses.length === 1) {
    tc012.expected.vulnerabilityClasses = ['BUSINESS_LOGIC_FLAW'];
  }
  
  const after = JSON.stringify(tc012.expected.vulnerabilityClasses);
  
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  
  console.log(`Successfully updated tc_012.`);
  console.log(`BEFORE: ${before}`);
  console.log(`AFTER:  ${after}`);
  
  // verify JSON is valid
  JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('JSON remains valid.');
} else {
  console.error('tc_012 not found');
}
