const fs = require('fs');

const run1Mismatches = [
  "tc_012", "tc_013", "tc_015", "tc_031", "tc_032", "tc_033", "tc_037", "tc_038",
  "tc_040", "tc_041", "tc_042", "tc_043", "tc_044", "tc_047", "tc_048", "tc_052",
  "tc_063", "tc_065", "tc_069", "tc_074", "tc_075", "tc_076", "tc_077", "tc_079",
  "tc_080", "tc_085", "tc_086", "tc_087", "tc_089", "tc_091", "tc_092", "tc_093",
  "tc_098", "tc_100"
];

const run2Mismatches = [
  "tc_012", "tc_013", "tc_015", "tc_030", "tc_037", "tc_038", "tc_040", "tc_041",
  "tc_042", "tc_043", "tc_044", "tc_047", "tc_048", "tc_049", "tc_051", "tc_052",
  "tc_061", "tc_063", "tc_065", "tc_066", "tc_069", "tc_076", "tc_077", "tc_079",
  "tc_080", "tc_085", "tc_086", "tc_089", "tc_091", "tc_092", "tc_093", "tc_098"
];

// Determine ground truth fixed cases
const gtFixed = ["tc_012", "tc_031", "tc_032", "tc_033", "tc_074", "tc_075", "tc_100"];

function analyze() {
  const run3Data = JSON.parse(fs.readFileSync('run3_results.json', 'utf8'));
  const run3Mismatches = run3Data.mismatches || [];

  let stablePass = 0;
  let stableFail = 0;
  let nondeterministic = 0;
  let bestCaseScore = 100;
  let worstCaseScore = 100;

  const table = [];

  for (let i = 1; i <= 100; i++) {
    const id = `tc_${i.toString().padStart(3, '0')}`;
    const r1 = !run1Mismatches.includes(id);
    const r2 = !run2Mismatches.includes(id);
    const r3 = !run3Mismatches.includes(id);

    let classification = "";
    
    if (r1 && r2 && r3) {
      classification = "STABLE PASS";
      stablePass++;
    } else if (!r1 && !r2 && !r3) {
      classification = "STABLE FAILURE";
      stableFail++;
    } else {
      classification = "NON-DETERMINISTIC";
      nondeterministic++;
    }
    
    // Adjust for GT fixes that caused r1=false and r2,r3=true
    if (gtFixed.includes(id) && !r1 && r2 && r3) {
       classification = "GROUND-TRUTH ISSUE (FIXED)";
       // it's effectively a stable pass under the new GT
       stablePass++;
       nondeterministic--;
    }

    if (!r1) worstCaseScore--;
    if (!r1 && (r2 || r3)) {
        // failed r1, passed at least one of r2 or r3. Best case counts passing.
    } else if (!r1 && !r2 && !r3) {
        bestCaseScore--;
    }
    
    if (classification !== "STABLE PASS") {
      table.push({
        id,
        r1: r1 ? "MATCH" : "MISMATCH",
        r2: r2 ? "MATCH" : "MISMATCH",
        r3: r3 ? "MATCH" : "MISMATCH",
        classification
      });
    }
  }

  console.log("=== STABILITY TABLE ===");
  console.table(table);

  console.log("\n=== METRICS ===");
  console.log("Stable Passing Cases (including 7 GT fixes):", stablePass);
  console.log("Stable Failing Cases:", stableFail);
  console.log("Non-deterministic Cases:", nondeterministic);
  
  const r1Acc = 100 - run1Mismatches.length;
  const r2Acc = 100 - run2Mismatches.length;
  const r3Acc = 100 - run3Mismatches.length;
  
  console.log(`Run 1 Accuracy (pre-GT-fix): ${r1Acc}%`);
  console.log(`Run 2 Accuracy (post-GT-fix): ${r2Acc}%`);
  console.log(`Run 3 Accuracy (post-GT-fix): ${r3Acc}%`);
  
  // Best case assumes any non-deterministic success means the system CAN do it
  // But wait, the user asked for worst case and best case over runs
  console.log(`Mean Accuracy (Runs 2 & 3): ${((r2Acc + r3Acc) / 2).toFixed(2)}%`);
  
  // Calculate per-case pass rate and identify top 10 stable failures
  console.log("\n=== TOP 10 STABLE FAILURES ===");
  const topStableFails = table.filter(t => t.classification === "STABLE FAILURE").map(t => t.id).slice(0, 10);
  console.log(topStableFails.join(", "));
}

analyze();
