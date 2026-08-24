const url = 'https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet';
const headers = {
  'Content-Type': 'application/json',
  'x-test-bypass': 'true'
};

async function test(name, code, expectedVerdict) {
  console.log(`\nTesting: ${name}`);
  console.log(`Expected: ${expectedVerdict}`);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ files: [{ name: 'snippet.js', content: code }] })
  });
  const data = await res.json();
  const verdict = data.report.verdict;
  console.log(`Actual:   ${verdict} ${verdict === expectedVerdict ? '✅' : '❌'}`);
  console.log(`Findings: ${data.report.totalFindings}`);
  
  // Also log checkpoints that are either NOT_VERIFIED or have APPLICABLE applicability
  const relevantCps = data.report.checkpoints.filter(c => c.verdict === 'NOT_VERIFIED' || c.applicability === 'APPLICABLE');
  if (relevantCps.length > 0) {
    console.log(`Relevant Checkpoints:`);
    relevantCps.forEach(c => {
      console.log(`  - ${c.checkpointName}: Verdict = ${c.verdict}, Applicability = ${c.applicability || 'MISSING'}`);
    });
  } else {
    console.log(`No relevant checkpoints (all are PASS and NOT_APPLICABLE).`);
  }
}

async function run() {
  await test('Clean self-contained health/greeting snippet', `
const express = require("express");
const app = express();
app.get("/health", (_req, res) => res.json({status: "ok"}));
app.listen(3000);
  `, 'PASS');

  await test('SQL injection', `
const express = require('express');
const app = express();
const db = require('./db');
app.get('/user', (req, res) => {
  const query = \`SELECT * FROM users WHERE id = \${req.query.id}\`;
  db.query(query, (err, result) => res.json(result));
});
  `, 'FAIL');

  await test('Partial security-sensitive flow with missing auth context', `
const express = require('express');
const router = express.Router();
// The actual database query and user authentication logic are missing from this snippet
router.post('/api/delete-user', (req, res) => {
  const { userId } = req.body;
  userService.deleteUser(userId);
  res.send("Deleted");
});
  `, 'NOT_VERIFIED');

  await test('Explicit authentication bypass', `
const express = require('express');
const router = express.Router();
// The user intentionally bypassed auth for testing
router.post('/api/delete-user', (req, res) => {
  const { userId } = req.body;
  const isTestUser = true; // explicitly bypassing auth checks
  if (isTestUser) {
    db.query(\`DELETE FROM users WHERE id = \${userId}\`);
  }
  res.send("Deleted");
});
  `, 'FAIL');
}

run();
