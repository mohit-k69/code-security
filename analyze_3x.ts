import fs from "fs";

// Helper to determine if a single run matches expected
function isMatch(exp: any, act: any) {
  if (act.error) return false;
  
  const vMatch = exp.verdict === act.verdict;
  
  const expectedFindingCount = exp.findingCount;
  const fMatch = expectedFindingCount === act.findingCount;
  
  const expClasses = (exp.vulnerabilityClasses || []).slice().sort().join(",");
  const actClasses = (act.classes || []).slice().sort().join(",");
  const cMatch = expClasses === actClasses;
  
  const expSevs = (exp.severities || []).slice().sort().join(",");
  const actSevs = (act.severities || []).slice().sort().join(",");
  const sMatch = expSevs === actSevs;
  
  return vMatch && fMatch && cMatch && sMatch;
}

function getClassification(tc: any) {
  const matches = tc.runs.map((r: any) => isMatch(tc.expected, r));
  const allMatch = matches.every((m: boolean) => m === true);
  const allFail = matches.every((m: boolean) => m === false);
  
  if (allMatch) return "STABLE MATCH";
  if (allFail) return "STABLE FAILURE";
  return "NON-DETERMINISTIC";
}

const baseline = JSON.parse(fs.readFileSync("benchmark_3x_results.json", "utf-8"));
const current = JSON.parse(fs.readFileSync("benchmark_new_3x_results.json", "utf-8"));

const prevClasses: Record<string, string> = {};
const currClasses: Record<string, string> = {};

for (const key of Object.keys(baseline)) {
  prevClasses[key] = getClassification(baseline[key]);
}

console.log("=== PER-CASE STABILITY TABLE ===");
console.log("ID\tRun 1\tRun 2\tRun 3\tClassification");
for (const key of Object.keys(current)) {
  currClasses[key] = getClassification(current[key]);
  const matches = current[key].runs.map((r: any) => isMatch(current[key].expected, r) ? "MATCH" : "FAIL ");
  console.log(`${key}\t${matches[0]}\t${matches[1]}\t${matches[2]}\t${currClasses[key]}`);
}

console.log("\n=== SPECIFIC ANALYSIS: TARGET 8 CASES ===");
const targets = ['tc_023', 'tc_024', 'tc_025', 'tc_026', 'tc_083', 'tc_084', 'tc_087', 'tc_088'];
for (const t of targets) {
  console.log(`${t}: Baseline=${prevClasses[t]} -> Current=${currClasses[t]}`);
}

let stableToStable = 0;
let stableToUnstable = 0;
let failToPass = 0;
let nonDetChange = 0;
let newStableFails = 0;

for (const key of Object.keys(current)) {
  const prev = prevClasses[key];
  const curr = currClasses[key];
  
  if (prev === "STABLE MATCH" && curr === "STABLE MATCH") stableToStable++;
  if (prev === "STABLE MATCH" && curr !== "STABLE MATCH") stableToUnstable++;
  if (prev === "STABLE FAILURE" && curr === "STABLE MATCH") failToPass++;
  if (prev === "NON-DETERMINISTIC" && curr !== "NON-DETERMINISTIC") nonDetChange++;
  if (prev !== "STABLE FAILURE" && curr === "STABLE FAILURE") newStableFails++;
}

console.log("\n=== COMPARISON METRICS ===");
console.log(`Previous stable passes that remain stable: ${stableToStable}`);
console.log(`Previous stable passes that became unstable/failures: ${stableToUnstable}`);
console.log(`Previous stable failures that became stable passes: ${failToPass}`);
console.log(`Previous nondeterministic cases that changed classification: ${nonDetChange}`);
console.log(`New stable failures introduced by this change: ${newStableFails}`);
