import dataset from "./eval_braintrust_30_cases.json" with { type: "json" };

async function fetchCase(id: string) {
  const tc = dataset.find((c: any) => c.id === id);
  if (!tc) return console.log("Not found:", id);

  const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet";
  
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-bypass': 'true'
    },
    body: JSON.stringify({
      files: [{ name: "snippet.js", content: tc.snippet }]
    })
  });
  
  const data = await res.json();
  console.log(`\n================== ${id} ==================`);
  console.log("Overall Verdict:", data.report.verdict);
  for (const cp of data.report.checkpoints) {
    console.log(`- ${cp.checkpointId}: ${cp.verdict}`);
  }
  const findings = [];
  for (const severity of ['critical', 'warning', 'info']) {
    for (const f of data.report.findings[severity]) {
      findings.push({ class: f.vulnerabilityClass, title: f.title, severity: f.severity });
    }
  }
  console.log("Findings:", findings);
}

async function main() {
  await fetchCase("tc_012");
  await fetchCase("tc_013");
  await fetchCase("tc_028");
  await fetchCase("tc_030");
}
main();
