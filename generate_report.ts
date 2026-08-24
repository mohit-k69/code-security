import {
  findingCountAccuracy,
  findingClassAccuracy,
  severityAccuracy,
  deduplicationAccuracy,
  verdictAccuracy
} from "./braintrust_scorers.ts";

async function runEval() {
  const data = JSON.parse(await Deno.readTextFile("./eval_braintrust_30_cases.json"));
  const cases = data.cases || data;
  const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet";

  console.log("| Case ID | Expected Verdict | Actual Verdict | Expected Classes | Actual Classes | Expected Count | Actual Count | Expected Severity | Actual Severity |");
  console.log("|---|---|---|---|---|---|---|---|---|");

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const input = testCase.snippet;
    const expected = testCase.expected;

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-bypass': 'true'
        },
        body: JSON.stringify({
          files: [{ name: "snippet.js", content: input }]
        })
      });

      if (!res.ok) continue;

      const responseData = await res.json();
      const output = responseData.report;
      const args = { expected, output };

      const vAcc = verdictAccuracy(args);
      const cAcc = findingClassAccuracy(args);
      const countAcc = findingCountAccuracy(args);
      const sevAcc = severityAccuracy(args);
      const dedupAcc = deduplicationAccuracy(args);

      if (vAcc === 0 || cAcc === 0 || countAcc === 0 || sevAcc === 0 || dedupAcc === 0) {
        
        const expectedClasses = expected.vulnerabilityClasses?.join(", ") || "";
        
        let actualClassesArr = [];
        let actualSevArr = [];
        if (output.findings) {
          for (const severity of Object.keys(output.findings)) {
            for (const finding of output.findings[severity]) {
              if (finding.vulnerabilityClass) actualClassesArr.push(finding.vulnerabilityClass);
              actualSevArr.push(severity);
            }
          }
        }
        
        const expectedCount = expected.findingCount ?? 0;
        const actualCount = output.totalFindings ?? 0;
        
        const expectedSev = expected.severities?.join(", ") || "";

        console.log(`| ${testCase.id} | ${expected.verdict} | ${output.verdict} | ${expectedClasses} | ${actualClassesArr.join(", ")} | ${expectedCount} | ${actualCount} | ${expectedSev} | ${actualSevArr.join(", ")} |`);
      }
    } catch (e) {
      // Ignore
    }
  }
}

runEval();
