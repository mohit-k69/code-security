import { createClient } from "npm:@supabase/supabase-js@2";

const url = "https://riqjsppvihvcyihuhkzg.supabase.co";
const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpcWpzcHB2aWh2Y3lpaHVoa3pnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTU3NTE2NCwiZXhwIjoyMTAxMTUxMTY0fQ.2pPPddQ5txQa6097V7u1PD-zGvF3s7uHsoQtcXv1PrE";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpcWpzcHB2aWh2Y3lpaHVoa3pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzUxNjQsImV4cCI6MjEwMTE1MTE2NH0.KaRLFezuh9aw4ovPVUGw-4uhWdslKvuXObfmFScUa2w";

const adminSupabase = createClient(url, serviceKey);
const anonSupabase = createClient(url, anonKey);

async function main() {
  const { data: linkData } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'mohit.k.main@gmail.com'
  });
  
  const otp = linkData?.properties?.email_otp;
  const { data: authData } = await anonSupabase.auth.verifyOtp({
    email: 'mohit.k.main@gmail.com', token: otp, type: 'magiclink'
  });
  const token = authData.session.access_token;

  const res2 = await fetch(`${url}/functions/v1/analyze-repository`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner: "mohit-k69", repo: "AI--TASK-MANAGER-" }) 
  });
  const t2 = await res2.json();
  const allFindings = [
    ...(t2.report?.findings?.critical || []),
    ...(t2.report?.findings?.warning || []),
    ...(t2.report?.findings?.info || [])
  ];
  console.log(`Total findings: ${allFindings.length}`);
  allFindings.forEach((f, idx) => {
    console.log(`\n--- Finding ${idx + 1} ---`);
    console.log(`Title: ${f.title}`);
    console.log(`Class: ${f.vulnerabilityClass}`);
    console.log(`Severity: ${f.severity}`);
    console.log(`CWEs: ${JSON.stringify(f.cwes)}`);
    console.log(`File: ${f.primaryLocation?.file}:${f.primaryLocation?.line}`);
    console.log(`Desc: ${f.description}`);
    console.log(`Suggestion: ${f.suggestion}`);
    console.log(`Contributing: ${JSON.stringify(f.contributingCheckpoints)}`);
  });
}
main();
