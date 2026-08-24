const fs = require('fs');
async function run() {
  const data = JSON.parse(fs.readFileSync('eval_braintrust_30_cases.json', 'utf8'));
  for (const id of ['tc_023', 'tc_025']) {
    const tc = data.find(c => c.id === id);
    const res = await fetch("https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-bypass": "true" },
      body: JSON.stringify({ files: [{ name: "snippet.js", content: tc.snippet }] })
    });
    const json = await res.json();
    console.log(id, ":", json.report.verdict, json.report.findings ? Object.keys(json.report.findings) : []);
  }
}
run();
