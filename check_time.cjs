const fs = require('fs');

async function run() {
  const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Desktop/code-security/eval_braintrust_30_cases.json', 'utf8'));
  const promises = data.map(async c => {
    try {
      const start = Date.now();
      const res = await fetch("https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-bypass": "true" },
        body: JSON.stringify({ files: [{ name: "snippet.js", content: c.snippet }] })
      });
      const time = Date.now() - start;
      return `${c.id} ${time}ms`;
    } catch(e) {
      return `${c.id} error`;
    }
  });
  const results = await Promise.all(promises);
  results.forEach(r => console.log(r));
}
run().catch(console.error);
