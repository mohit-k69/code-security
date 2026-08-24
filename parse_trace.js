const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Downloads/trace_10fa79fee2e12cb20407ce0b18419803.json', 'utf8'));

console.log(`Total events: ${data.length}`);

// We need to find eval tasks or span outputs that contain scores.
// Let's print out the keys of the first few items that have scores.

let found = 0;
for (const item of data) {
  if (item.scores || (item.output && item.output.verdict)) {
    console.log(JSON.stringify(item, null, 2));
    found++;
    if (found > 0) break;
  }
}
