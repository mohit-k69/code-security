import { ReviewOrchestrator } from "./supabase/functions/analyze-repository/orchestrator/ReviewOrchestrator.ts";

const snippet = `
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

async function run() {
    Deno.env.set("OPENROUTER_API_KEY", process.env.OPENROUTER_API_KEY || "");
    const orchestrator = new ReviewOrchestrator();
    
    // Using SEC-SECRET-001 and SEC-INPUT-001 since they both found the secrets according to the live test logs
    const report = await orchestrator.executeCheckpoints(
      "owner/repo", 
      1, 
      "local", 
      [{ path: "snippet.js", content: snippet, deleted: false }]
    );

    // Because orchestrator.executeCheckpoints aggregates internally, we need to see if we can get the raw findings.
    // Wait, executeCheckpoints returns the aggregated report.
    // To see raw findings, we can print the raw LLM responses or intercept FindingAggregator.
    console.log("Raw findings length:", report.metrics?.rawFindingsCount);
    console.log("Aggregated findings length:", report.metrics?.aggregatedFindingsCount);
    console.log("Findings:", JSON.stringify(report.findings, null, 2));
}

run();
