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
      const output = json.report;
      const expected = c.expected;
      
      let failCount = false;
      let failVerdict = false;
      
      if (expected.findingCount !== output.totalFindings) {
        failCount = true;
      }
      
      const expectedVerdict = expected.verdict;
      if (expectedVerdict !== output.verdict) {
        failVerdict = true;
      }
      
      return { id: c.id, failCount, failVerdict, expected, output };
    } catch(e) {
      return { id: c.id, error: e.message };
    }
  });
  const results = await Promise.all(promises);
  
  const failedCounts = results.filter(r => r.failCount).map(r => r.id);
  const failedVerdicts = results.filter(r => r.failVerdict).map(r => r.id);
  
  console.log("Failed Finding Count cases:", failedCounts);
  console.log("Failed Verdict cases:", failedVerdicts);
}
run().catch(console.error);
