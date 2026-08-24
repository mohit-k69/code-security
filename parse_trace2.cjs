const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Downloads/trace_10fa79fee2e12cb20407ce0b18419803.json', 'utf8'));

let tcs = new Set();
for (const item of data) {
  if (item.input && item.input.id) {
    tcs.add(item.input.id);
  }
}
console.log(Array.from(tcs).join(', '));
