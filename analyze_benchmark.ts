import fs from "fs";

const results = JSON.parse(fs.readFileSync("benchmark_1x_results.json", "utf-8"));

let total = 0;
let overallMatch = 0;
let verdictMatch = 0;
let findingCountMatch = 0;
let severityMatch = 0;
let vulnClassMatch = 0;

const mismatches: string[] = [];

for (const id of Object.keys(results)) {
  total++;
  const tc = results[id];
  const exp = tc.expected;
  const act = tc.actual;
  
  if (act.error) {
    mismatches.push(id);
    continue;
  }
  
  const vMatch = exp.verdict === act.verdict;
  if (vMatch) verdictMatch++;
  
  const expectedFindingCount = exp.findingCount;
  const fMatch = expectedFindingCount === act.findingCount;
  if (fMatch) findingCountMatch++;
  
  const expClasses = (exp.vulnerabilityClasses || []).slice().sort().join(",");
  const actClasses = (act.classes || []).slice().sort().join(",");
  const cMatch = expClasses === actClasses;
  if (cMatch) vulnClassMatch++;
  
  const expSevs = (exp.severities || []).slice().sort().join(",");
  const actSevs = (act.severities || []).slice().sort().join(",");
  const sMatch = expSevs === actSevs;
  if (sMatch) severityMatch++;
  
  const isMatch = vMatch && fMatch && cMatch && sMatch;
  if (isMatch) {
    overallMatch++;
  } else {
    mismatches.push(id);
  }
}

console.log(`1. Overall accuracy: ${((overallMatch/total)*100).toFixed(1)}% (${overallMatch}/${total})`);
console.log(`2. Verdict accuracy: ${((verdictMatch/total)*100).toFixed(1)}%`);
console.log(`3. Finding-count accuracy: ${((findingCountMatch/total)*100).toFixed(1)}%`);
console.log(`4. Severity accuracy: ${((severityMatch/total)*100).toFixed(1)}%`);
console.log(`5. Vulnerability-class accuracy: ${((vulnClassMatch/total)*100).toFixed(1)}%`);
console.log(`6. Deduplication accuracy: (Implicitly tested by finding-count accuracy)`);
console.log(`7. Total mismatches: ${mismatches.length}`);
console.log(`8. Exact mismatching case IDs: ${mismatches.join(", ")}`);

console.log("\nA. Targeted 8 cases:");
const targets = ['tc_023', 'tc_024', 'tc_025', 'tc_026', 'tc_083', 'tc_084', 'tc_087', 'tc_088'];
for (const t of targets) {
  const r = results[t];
  if (!r) console.log(`${t}: NOT FOUND`);
  else console.log(`${t}: Expected ${r.expected.verdict}, Actual ${r.actual?.verdict}, Match: ${r.expected.verdict === r.actual?.verdict ? "YES" : "NO"}`);
}
