const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet";

async function runTest(name, code, expectedVerdict) {
  console.log(`\n================================`);
  console.log(`TEST: ${name}`);
  console.log(`Expected: ${expectedVerdict}`);
  console.log(`================================`);
  
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-bypass': 'true'
      },
      body: JSON.stringify({
        files: [{ name: "snippet.js", content: code }]
      })
    });
    
    if (!res.ok) {
      console.error(`HTTP Error: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.error(text);
      return;
    }
    
    const data = await res.json();
    
    if (!data.report) {
      console.log("Raw Response:");
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    
    const report = data.report;
    
    console.log(`Verdict: ${report.verdict}`);
    console.log(`Total Findings: ${report.totalFindings}`);
    console.log(`Checkpoints in result array: ${report.checkpoints.length}`);
    
    for (const cp of report.checkpoints) {
      console.log(`  - Checkpoint: ${cp.checkpointName} (${cp.checkpointId})`);
      console.log(`    Verdict: ${cp.verdict}`);
      console.log(`    Applicability: ${cp.applicability}`);
      console.log(`    Findings: ${cp.findingCount ?? cp.findings}`);
    }

    if (report.totalFindings > 0) {
      console.log(`\nFindings:`);
      for (const severity in report.findings) {
        for (const f of report.findings[severity]) {
          console.log(`  - [${severity.toUpperCase()}] ${f.vulnerabilityClass}: ${f.title}`);
          console.log(`    Description: ${f.description}`);
          if (f.evidence && f.evidence.length > 0) {
            console.log(`    Evidence: ${f.evidence[0].snippet}`);
            console.log(`    Explanation: ${f.evidence[0].explanation}`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

async function main() {
  const t1 = `
const express = require('express');
const app = express();
app.get('/health', (req, res) => res.json({status: 'ok'}));
app.listen(3000);
`;

  const t2 = `
const db = require('./db');
function getUser(id) {
  return db.query("SELECT * FROM users WHERE id = " + id);
}
`;

  const t3 = `
const express = require("express");
const router = express.Router();

// Authentication and authorization implementation are outside this snippet.
router.post("/api/charge-user", (req, res) => {
  const userId = req.body.userId;
  const amount = req.body.amount;

  db.execute(
    "UPDATE accounts SET balance = balance - ? WHERE id = ?",
    [amount, userId]
  );

  res.send("Charged");
});
`;

  const t4 = `
function chargeUser(req, res) {
  const userId = req.body.userId;
  const amount = req.body.amount;
  db.execute("UPDATE accounts SET balance = balance - " + amount + " WHERE id = " + userId);
  res.send("Charged");
}
`;

  const t5 = `
const express = require('express');
const app = express();
app.post('/api/data', (req, res) => {
  // bypass auth for testing
  // if (!req.session.user) return res.status(401).send();
  db.execute("DELETE FROM items WHERE id = ?", [req.body.id]);
  res.send("Deleted");
});
`;

  await runTest("Clean health snippet", t1, "PASS, 0 findings, 0 selected security checkpoints.");
  await runTest("Direct SQL interpolation", t2, "FAIL, SQL_INJECTION, exactly 1 underlying SQL injection finding.");
  await runTest("Partial security-sensitive operation with parameterized SQL", t3, "AuthZ selected / applicable; NOT_VERIFIED; no SQL_INJECTION; overall NOT_VERIFIED");
  await runTest("Explicit SQL injection using concatenation", t4, "FAIL, SQL_INJECTION.");
  await runTest("Explicit authentication bypass", t5, "FAIL, AUTH_BYPASS.");
}

main();
