const fs = require('fs');

async function run() {
  const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Desktop/code-security/eval_braintrust_30_cases.json', 'utf8'));
  const nvCases = data.filter(d => d.expected.verdict === "NOT_VERIFIED");

  for (const c of nvCases) {
    const res = await fetch("https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-bypass": "true" },
      body: JSON.stringify({ files: [{ name: "snippet.js", content: c.snippet }] })
    });
    const json = await res.json();
    console.log(`${c.id}: ${json.report.verdict}`);
  }
}
run().catch(console.error);
