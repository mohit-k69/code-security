import fs from 'fs';

const filePath = './eval_braintrust_100_cases.json';
const dataStr = fs.readFileSync(filePath, 'utf-8');
const data = JSON.parse(dataStr);

let modifiedCount = 0;
let modifiedIndex = -1;

for (let i = 0; i < data.length; i++) {
  const tc = data[i];
  if (tc.id === 'tc_042') {
    if (tc.expected && tc.expected.vulnerabilityClasses) {
       tc.expected.vulnerabilityClasses = ["BUSINESS_LOGIC_FLAW"];
       modifiedCount++;
       modifiedIndex = i;
    }
  }
}

if (modifiedCount === 1) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", 'utf-8');
  console.log("Successfully updated 1 case.");
} else {
  console.log(`Failed! Modified count was ${modifiedCount}.`);
  process.exit(1);
}

// Verification
const newDataStr = fs.readFileSync(filePath, 'utf-8');
let newData;
try {
  newData = JSON.parse(newDataStr);
  console.log("JSON is valid.");
} catch(e) {
  console.error("Invalid JSON!");
  process.exit(1);
}

const newTc = newData.find((t: any) => t.id === 'tc_042');
if (newTc && newTc.expected.vulnerabilityClasses[0] === 'BUSINESS_LOGIC_FLAW') {
   console.log("Verification passed: tc_042 expects BUSINESS_LOGIC_FLAW.");
} else {
   console.log("Verification failed.");
   process.exit(1);
}
