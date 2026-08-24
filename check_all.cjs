const fs = require('fs');

async function run() {
  const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Desktop/code-security/eval_braintrust_30_cases.json', 'utf8'));

  for (const c of data) {
    try {
      const res = await fetch("https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-bypass": "true" },
        body: JSON.stringify({ files: [{ name: "snippet.js", content: c.snippet }] })
      });
      if (!res.ok) {
        console.log(`ERROR_HTTP ${c.id}: ${res.status} ${await res.text()}`);
      } else {
        const json = await res.json();
        console.log(`SUCCESS ${c.id}`);
      }
    } catch(e) {
      console.log(`ERROR_CATCH ${c.id}: ${e.message}`);
    }
  }
}
run().catch(console.error);
