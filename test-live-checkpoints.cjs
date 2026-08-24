const url = 'https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet';
const headers = { 'Content-Type': 'application/json', 'x-test-bypass': 'true' };
async function test(name, code) {
  console.log(`\nTesting: ${name}`);
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ files: [{ name: 'snippet.js', content: code }] }) });
  const data = await res.json();
  const cps = data.report.checkpoints.filter(c => c.verdict === 'NOT_VERIFIED');
  console.log(`NOT_VERIFIED checkpoints: ${cps.map(c => c.checkpointName + ' (' + c.confidence + ')').join(', ')}`);
}
async function run() {
  await test('Clean', 'const express = require("express"); app.get("/health", (_req, res) => res.json({status: "ok"}));');
  await test('Partial', 'const express = require("express"); const router = express.Router(); router.post("/api/delete-user", (req, res) => { userService.deleteUser(req.body.userId); res.send("Deleted"); });');
}
run();
