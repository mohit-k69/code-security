const https = require('https');

const data = JSON.stringify({
  files: [{
    name: "snippet.js",
    content: "const DB_PASSWORD = \"super_secret_db_pass_123\";\nconst API_KEY = \"sk_live_1234567890abcdef\";"
  }]
});

const options = {
  hostname: 'riqjsppvihvcyihuhkzg.supabase.co',
  port: 443,
  path: '/functions/v1/analyze-snippet',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-test-bypass': 'true',
    'Content-Length': data.length
  }
};

async function makeRequest(runIdx) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  for (let i=1; i<=5; i++) {
    console.log(`\n--- RUN ${i} ---`);
    const resp = await makeRequest(i);
    const report = resp.report;
    const cp = report.checkpoints.find(c => c.checkpointId === 'SEC-SECRET-001');
    const rawCount = cp ? cp.findingCount : 0;
    console.log(`Raw SECRET_EXPOSURE findings (from checkpoint metrics): ${rawCount}`);
    
    const aggregated = report.findings.critical.filter(f => f.vulnerabilityClass === 'SECRET_EXPOSURE');
    
    let state = '';
    if (aggregated.length === 2) {
      state = "A) two separate findings";
    } else if (aggregated.length === 1) {
      if (aggregated[0].evidence.length >= 2) {
        state = "B) one finding containing two evidence items";
      } else {
        state = "C) one finding containing only one secret";
      }
    } else {
      state = "No findings";
    }
    
    console.log(`Aggregated findings in report: ${aggregated.length}`);
    
    aggregated.forEach((f, idx) => {
      console.log(` Finding ${idx+1} [primaryLocation.line = ${f.primaryLocation.line}]:`);
      f.evidence.forEach(e => {
        console.log(`   - Evidence line ${e.line}: ${e.snippet}`);
      });
    });
    
    console.log(`Result: ${state}`);
  }
}

run();
