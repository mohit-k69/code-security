const fs = require('fs');

async function run() {
  const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Desktop/code-security/eval_braintrust_30_cases.json', 'utf8'));
  const passCases = data.filter(d => d.expected.verdict === "PASS");

  const results = [];
  for (const c of passCases) {
    const res = await fetch("https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-bypass": "true" },
      body: JSON.stringify({ files: [{ name: "snippet.js", content: c.snippet }] })
    });
    const json = await res.json();
    results.push({ id: c.id, expected: "PASS", actual: json.report.verdict });
    console.log(`${c.id}: ${json.report.verdict}`);
  }
}
run().catch(console.error);
