const fs = require('fs');
const content = fs.readFileSync('trace_3_final_cases.log', 'utf-8');
const cases = content.split('EVALUATING tc_');

for (let i = 1; i < cases.length; i++) {
  const caseBlock = cases[i];
  const tcId = 'tc_' + caseBlock.split('\n')[0].trim();
  
  const finalIndex = caseBlock.indexOf('FINAL AGGREGATED OUTPUT:');
  if (finalIndex === -1) {
    console.log(`${tcId}: Error parsing`);
    continue;
  }
  let jsonStr = caseBlock.substring(finalIndex + 25).trim();
  jsonStr = jsonStr.split('======================================================')[0].trim();
  
  const json = JSON.parse(jsonStr);
  
  let findingClass = 'N/A';
  let severity = 'N/A';
  
  const checkpoints = json.checkpoints.map(c => `${c.checkpointId}(${c.verdict}/${c.applicability})`).join(', ');
  
  if (json.totalFindings > 0) {
    const finding = (json.findings.critical && json.findings.critical[0]) || 
                    (json.findings.warning && json.findings.warning[0]) || 
                    (json.findings.info && json.findings.info[0]);
    if (finding) {
       findingClass = finding.vulnerabilityClass;
       severity = finding.severity;
    }
  }
  
  console.log(`${tcId} | Final: ${json.verdict} | Checkpoints: ${checkpoints} | Class: ${findingClass} | Sev: ${severity}`);
}
