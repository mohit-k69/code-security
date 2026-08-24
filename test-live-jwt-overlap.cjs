const url = 'https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet';
const headers = { 'Content-Type': 'application/json', 'x-test-bypass': 'true' };

async function run() {
  const code = `
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

const JWT_SECRET = "my_hardcoded_jwt_secret";

app.post('/api/login', (req, res) => {
  const token = jwt.sign({ user: "admin" }, JWT_SECRET);
  res.json({ token });
});
  `;

  console.log("Testing JWT/Secret Overlap Separation...");
  try {
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
    const allFindings = [
      ...(data.report.findings.critical || []), 
      ...(data.report.findings.warning || []), 
      ...(data.report.findings.info || [])
    ];

    let secretExposureCount = 0;
    let jwtSecurityCount = 0;
    let authCheckpointBundled = false;

    allFindings.forEach(f => {
      if (f.vulnerabilityClass === 'SECRET_EXPOSURE') secretExposureCount++;
      if (f.vulnerabilityClass === 'JWT_SECURITY') jwtSecurityCount++;
      
      if (f.contributingCheckpoints.includes('SEC-AUTH-001')) {
        if (f.vulnerabilityClass === 'SECRET_EXPOSURE' || f.vulnerabilityClass === 'JWT_SECURITY') {
          authCheckpointBundled = true;
          console.log(`❌ SEC-AUTH-001 improperly flagged ${f.vulnerabilityClass}: ${f.title}`);
        }
      }
    });

    console.log(`SECRET_EXPOSURE Count: ${secretExposureCount} (Expected: 1)`);
    console.log(`JWT_SECURITY Count: ${jwtSecurityCount} (Expected: 1)`);
    
    if (secretExposureCount === 1 && jwtSecurityCount === 1 && !authCheckpointBundled) {
      console.log("✅ Regression Test Passed: No overlapping ownership issues.");
    } else {
      console.log("❌ Regression Test Failed.");
      console.log("Findings details:");
      allFindings.forEach(f => console.log(` - [${f.vulnerabilityClass}] ${f.title} (by ${f.contributingCheckpoints.join(', ')})`));
    }
  } catch(e) {
    console.log("Error:", e.message);
  }
}

run();
