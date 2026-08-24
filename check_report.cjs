const fs = require('fs');

async function run() {
  const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Desktop/code-security/eval_braintrust_30_cases.json', 'utf8'));
  const promises = data.map(async c => {
    try {
      const res = await fetch("https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-bypass": "true" },
        body: JSON.stringify({ files: [{ name: "snippet.js", content: c.snippet }] })
      });
      const json = await res.json();
      if (!json.report) return `NO_REPORT ${c.id}`;
    } catch(e) {
      return `ERROR_CATCH ${c.id}: ${e.message}`;
    }
  });
  const results = await Promise.all(promises);
  results.forEach(r => {
    if (r) console.log(r);
  });
  console.log("Done");
}
run().catch(console.error);
