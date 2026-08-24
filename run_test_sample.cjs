const fs = require('fs');
const url = 'https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet';
const headers = { 'Content-Type': 'application/json', 'x-test-bypass': 'true' };

async function run() {
  const code = fs.readFileSync('test-sample.js', 'utf-8');
  console.log(`\nTesting: test-sample.js`);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ files: [{ name: 'test-sample.js', content: code }] })
  });
  const data = await res.json();
  
  if (data.error) {
    console.error("API Error:", data.error);
    return;
  }
  
  const report = data.report;
  
  const allFindings = [
    ...(report.findings.critical || []), 
    ...(report.findings.warning || []), 
    ...(report.findings.info || [])
  ];
  
  console.log("Vulnerability Classes:");
  allFindings.forEach(f => {
    console.log(` - [${f.severity.toUpperCase()}] ${f.vulnerabilityClass}: ${f.title} (by ${f.contributingCheckpoints.join(', ')})`);
  });
}
run();
