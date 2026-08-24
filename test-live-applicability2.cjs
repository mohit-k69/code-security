const url = 'https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet';
const headers = {
  'Content-Type': 'application/json',
  'x-test-bypass': 'true'
};

async function test(name, code, expectedVerdict) {
  console.log(`\nTesting: ${name}`);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ files: [{ name: 'snippet.js', content: code }] })
  });
  const data = await res.json();
  const verdict = data.report.verdict;
  console.log(`Actual:   ${verdict}`);
  
  const cp = data.report.checkpoints.find(c => c.checkpointId === 'SEC-CONFIG-001');
  if (cp) {
    console.log(`SEC-CONFIG-001 details:`);
    console.log(cp);
  }
}

async function run() {
  await test('Clean self-contained health/greeting snippet', `
const express = require("express");
const app = express();
app.get("/health", (_req, res) => res.json({status: "ok"}));
app.listen(3000);
  `, 'PASS');
}

run();
