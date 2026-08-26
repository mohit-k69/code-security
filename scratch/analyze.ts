import fs from "fs";

const data = JSON.parse(fs.readFileSync('scratch/events.json', 'utf8'));

const events = data.events.filter((e: any) => 
  e.input != null && 
  e.input.id != null &&
  e.span_attributes?.purpose === "scorer"
);

const uniqueEvents = new Map();
events.forEach((e: any) => {
  uniqueEvents.set(e.input.id, {
    id: e.input.id,
    expected: e.input.expected,
    output: e.input.output
  });
});

const mismatches: any[] = [];

for (const [id, event] of uniqueEvents) {
  const exp = event.expected;
  const out = event.output;
  
  let mismatch = false;
  
  if (!exp || !out) continue;

  if (exp.verdict !== out.verdict) {
    mismatch = true;
  }
  
  if (exp.findingCount !== out.totalFindings) {
    mismatch = true;
  }
  
  const expClasses = (exp.vulnerabilityClasses || []).sort().join(',');
  const outClasses: string[] = [];
  ['critical', 'info', 'warning'].forEach(sev => {
     (out.findings[sev] || []).forEach((f: any) => outClasses.push(f.vulnerabilityClass));
  });
  if (expClasses !== outClasses.sort().join(',')) {
    mismatch = true;
  }
  
  if (mismatch) {
    mismatches.push(event);
  }
}

for (const m of mismatches) {
  console.log(`\n======================================`);
  console.log(`ID: ${m.id}`);
  console.log(`Verdict: Expected=${m.expected.verdict}, Actual=${m.output.verdict}`);
  console.log(`Findings Count: Expected=${m.expected.findingCount}, Actual=${m.output.totalFindings}`);
  
  const outClasses: string[] = [];
  const outSevs: string[] = [];
  ['critical', 'info', 'warning'].forEach(sev => {
     (m.output.findings[sev] || []).forEach((f: any) => {
       outClasses.push(f.vulnerabilityClass);
       outSevs.push(f.severity);
     });
  });
  
  console.log(`Expected Classes: ${(m.expected.vulnerabilityClasses || []).join(', ')}`);
  console.log(`Actual Classes: ${outClasses.join(', ')}`);
  console.log(`Expected Severities: ${(m.expected.severities || []).join(', ')}`);
  console.log(`Actual Severities: ${outSevs.join(', ')}`);
  
  console.log(`Checkpoints:`);
  m.output.checkpoints.forEach((c: any) => {
    console.log(`  - ${c.checkpointId}: ${c.verdict}`);
  });
}
console.log(`\nTotal mismatches: ${mismatches.length}`);
