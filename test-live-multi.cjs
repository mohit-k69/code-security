const url = 'https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet';
const headers = {
  'Content-Type': 'application/json',
  'x-test-bypass': 'true'
};

async function test(name, code) {
  console.log(`\nTesting: ${name}`);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ files: [{ name: 'snippet.js', content: code }] })
  });
  const data = await res.json();
  
  if (data.error) {
    console.error("API Error:", data.error);
    return;
  }
  
  const report = data.report;
  
  console.log(`Verdict: ${report.verdict}`);
  console.log(`Total Findings: ${report.totalFindings}`);
  console.log("Metrics: ", JSON.stringify(data.metrics, null, 2));
  console.log("Checkpoints: ", JSON.stringify(report.checkpoints, null, 2));
  
  const allFindings = [
    ...(report.findings.critical || []), 
    ...(report.findings.warning || []), 
    ...(report.findings.info || [])
  ];
  
  console.log("Vulnerability Classes:");
  allFindings.forEach(f => {
    console.log(` - [${f.severity.toUpperCase()}] ${f.vulnerabilityClass}: ${f.title} (by ${f.contributingCheckpoints.join(', ')})`);
  });
  
  // Find remaining duplicates (same vulnerability class)
  const classCounts = {};
  allFindings.forEach(f => {
    classCounts[f.vulnerabilityClass] = (classCounts[f.vulnerabilityClass] || 0) + 1;
  });
  
  const duplicates = Object.entries(classCounts).filter(([cls, count]) => count > 1);
  if (duplicates.length > 0) {
    console.log("Remaining Duplicates:");
    duplicates.forEach(([cls, count]) => console.log(` - ${cls}: ${count} findings`));
  } else {
    console.log("Remaining Duplicates: None");
  }
}

async function run() {
  const code = `
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
const db = require('./db');
const fs = require('fs');

const DB_PASS = "supersecret_db_password_123";
const JWT_SECRET = "my_hardcoded_jwt_secret";

app.post('/api/login', (req, res) => {
  if (req.body.username === "admin" && req.body.password === DB_PASS) {
    const token = jwt.sign({ user: "admin" }, JWT_SECRET);
    res.json({ token });
  }
});

app.get('/api/data', (req, res) => {
  
  // The first usage of the auth bypass is here on line 21
  const bypassAuth = req.query.bypass === "true";
  
  if (bypassAuth) {
    db.execute("SELECT * FROM items WHERE name = '" + req.query.name + "'");
    res.send("<h1>" + req.query.name + "</h1>");
  }
});

app.get('/api/file', (req, res) => {
  // We use a completely different sink but EXACT SAME evidence on line 32
  // We add space so the lines are > 3 apart
  
  
  const bypassAuth = req.query.bypass === "true";
  
  if (bypassAuth) {
    const file = fs.readFileSync("/var/www/uploads/" + req.query.file);
    res.send(file);
  }
});
  `;
  
  await test('Multi-vulnerability Paste Code test', code);
}

run();
