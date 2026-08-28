import fs from "fs";

const filename = "./benchmark_1x_results.json";
const results = JSON.parse(fs.readFileSync(filename, "utf-8"));

let totalCount = 0;
let verdictMatchCount = 0;
let findingCountMatchCount = 0;
let severityMatchCount = 0;
let classMatchCount = 0;
let overallMatchCount = 0;
let deduplicationMatchCount = 0;

let stablePasses = 0;
let stableFailures = 0;

const mismatchingCases = [];

for (const id in results) {
  const res = results[id];
  const expected = res.expected;
  const actual = res.actual;
  totalCount++;

  let verdictMatch = expected.verdict === actual.verdict;
  let findingCountMatch = expected.findingCount === actual.findingCount;
  
  // Severity and class match logic
  const sortStr = (arr: string[]) => [...arr].sort().join(",");
  let severityMatch = sortStr(expected.severities) === sortStr(actual.severities || []);
  let classMatch = sortStr(expected.vulnerabilityClasses) === sortStr(actual.classes || []);

  // In the benchmark script, deduplication accuracy is considered findingCountMatch
  // However, I will just track overall match.
  let overallMatch = verdictMatch && findingCountMatch && severityMatch && classMatch;

  if (verdictMatch) verdictMatchCount++;
  if (findingCountMatch) findingCountMatchCount++;
  if (severityMatch) severityMatchCount++;
  if (classMatch) classMatchCount++;
  // deduplication in previous runs was basically finding count accuracy
  if (findingCountMatch) deduplicationMatchCount++;

  if (overallMatch) {
    overallMatchCount++;
    if (actual.verdict === "PASS" || actual.verdict === "NOT_VERIFIED") stablePasses++;
    if (actual.verdict === "FAIL") stableFailures++;
  } else {
    mismatchingCases.push(id);
  }
}

console.log(`1. Overall accuracy: ${overallMatchCount}/${totalCount} (${(overallMatchCount/totalCount*100).toFixed(1)}%)`);
console.log(`2. Verdict accuracy: ${verdictMatchCount}/${totalCount} (${(verdictMatchCount/totalCount*100).toFixed(1)}%)`);
console.log(`3. Finding-count accuracy: ${findingCountMatchCount}/${totalCount} (${(findingCountMatchCount/totalCount*100).toFixed(1)}%)`);
console.log(`4. Severity accuracy: ${severityMatchCount}/${totalCount} (${(severityMatchCount/totalCount*100).toFixed(1)}%)`);
console.log(`5. Vulnerability-class accuracy: ${classMatchCount}/${totalCount} (${(classMatchCount/totalCount*100).toFixed(1)}%)`);
console.log(`6. Deduplication accuracy: ${deduplicationMatchCount}/${totalCount} (${(deduplicationMatchCount/totalCount*100).toFixed(1)}%)`);
console.log(`7. Total mismatches: ${mismatchingCases.length}`);
console.log(`8. Exact mismatching case IDs: ${mismatchingCases.join(", ")}`);
console.log(`\nComparison to baseline:`);
console.log(`Stable passes (PASS/NOT_VERIFIED that match entirely): ${stablePasses}`);
console.log(`Stable failures (FAIL that match entirely): ${stableFailures}`);

// Check specific 8 cases
const targeted = ['tc_023', 'tc_024', 'tc_025', 'tc_026', 'tc_083', 'tc_084', 'tc_087', 'tc_088'];
console.log(`\nTargeted 8 cases:`);
for (const id of targeted) {
  const r = results[id];
  console.log(`${id}: Expected ${r.expected.verdict}, Actual ${r.actual.verdict}`);
}
