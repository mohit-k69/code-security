import fs from "fs";

const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet";

async function codeVibeTask(input) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-bypass': 'true'
    },
    body: JSON.stringify({ files: [{ name: "snippet.js", content: input }] })
  });
  if (!res.ok) throw new Error("API failed");
  return (await res.json()).report;
}

async function run() {
  const exp = JSON.parse(fs.readFileSync('experiment_Generalization100.json', 'utf8'));
  const allCases = JSON.parse(fs.readFileSync('eval_braintrust_100_cases.json', 'utf8'));
  
  // Reconcile 42 vs 33
  const mismatches = exp.cases.filter(c => c.caseScore < 1);
  const mismatchIds = new Set(mismatches.map(c => c.id));
  console.log(`Reconciled: ${mismatchIds.size} unique failing case IDs out of 100.`);

  const analysis = [];
  
  for (const c of mismatches) {
    const groundTruth = allCases.find(ac => ac.id === c.id);
    console.log(`Re-evaluating ${c.id}...`);
    
    // We re-run to get the trace
    const report = await codeVibeTask(groundTruth.snippet);
    
    // Trace
    const rawFindings = [];
    if (report.checkpoints) {
      report.checkpoints.forEach(cp => {
         if (cp.findings) {
           cp.findings.forEach(f => rawFindings.push({...f, checkpoint: cp.checkpointId}));
         }
      });
    }
    
    const finalFindings = [];
    ['critical', 'warning', 'info'].forEach(sev => {
       if (report.findings && report.findings[sev]) {
         report.findings[sev].forEach(f => finalFindings.push(f));
       }
    });

    analysis.push({
      id: c.id,
      expected: groundTruth.expected,
      actualVerdict: report.verdict,
      checkpoints: report.checkpoints?.map(cp => ({ id: cp.checkpointId, verdict: cp.verdict })) || [],
      rawFindings,
      finalFindings,
      expMetrics: c
    });
  }
  
  fs.writeFileSync('scratch/failure_trace.json', JSON.stringify(analysis, null, 2));
  console.log("Wrote trace to scratch/failure_trace.json");
}

run().catch(console.error);
