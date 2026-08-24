const fs = require('fs');
const https = require('https');

const snippet = `
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

const DB_PASS = "supersecret_db_password_123";
const JWT_SECRET = "my_hardcoded_jwt_secret";

app.post('/api/login', (req, res) => {
  if (req.body.username === "admin" && req.body.password === DB_PASS) {
    const token = jwt.sign({ user: "admin" }, JWT_SECRET);
    res.json({ token });
  }
});

app.post('/api/bypass', (req, res) => {
  if (req.query.bypass === "true") {
    res.send("Admin area");
  }
});
`;

const payload = JSON.stringify({
  repository: "owner/repo",
  prNumber: 1,
  commitSha: "live-test",
  files: [
    {
      name: "snippet.js",
      content: snippet
    }
  ]
});

const req = https.request(
  "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet",
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-bypass': 'true',
      'Content-Length': Buffer.byteLength(payload)
    }
  },
  (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log(JSON.stringify(json, null, 2));
      } catch (e) {
        console.log(data);
      }
    });
  }
);

req.on('error', (e) => {
  console.error(e);
});
req.write(payload);
req.end();
