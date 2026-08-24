import { codeVibeTask } from "./run_local_eval.ts";
const data = JSON.parse(await Deno.readTextFile("./eval_braintrust_30_cases.json"));

const tc_010 = data.find((t: any) => t.id === 'tc_010');
const tc_030 = data.find((t: any) => t.id === 'tc_030');

async function measureNondeterminism(tc: any, runs: number) {
  console.log(`\nTesting ${tc.id} ${runs} times...`);
  const results = [];
  for (let i = 1; i <= runs; i++) {
    const start = performance.now();
    let output;
    let err = null;
    try {
      output = await codeVibeTask(tc.snippet);
    } catch (e: any) {
      err = e.message;
    }
    const duration = Math.round(performance.now() - start);
    
    if (err) {
      results.push({ run: i, error: err, duration });
    } else {
      const findings = Object.values(output.findings || {}).flat();
      const classes = findings.map((f: any) => f.vulnerabilityClass).sort();
      const severities = findings.map((f: any) => f.severity).sort();
      const checkpoints = [...new Set(findings.flatMap((f: any) => f.contributingCheckpoints || []))].sort();
      
      results.push({
        run: i,
        verdict: output.verdict,
        findingCount: findings.length,
        classes: classes.join(", ") || "None",
        severities: severities.join(", ") || "None",
        checkpoints: checkpoints.join(", ") || "None",
        duration: duration + "ms"
      });
    }
  }
  console.table(results);
}

async function run() {
  await measureNondeterminism(tc_010, 5);
  await measureNondeterminism(tc_030, 5);
}

run();
