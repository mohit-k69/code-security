import { initDataset } from "braintrust";

async function runEval() {
  const data = JSON.parse(await Deno.readTextFile("./eval_braintrust_30_cases.json"));
  const cases = data.cases || data;
  const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet";

  const targetIds = ["tc_010", "tc_017", "tc_014", "tc_020", "tc_004", "tc_013", "tc_005", "tc_012", "tc_025", "tc_028"];
  
  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    if (!targetIds.includes(testCase.id)) continue;
    
    const input = testCase.snippet;

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
      console.log(`\n\n========== CASE ${testCase.id} ==========`);
      console.log("METRICS:", JSON.stringify(responseData.metrics, null, 2));
      console.log("CHECKPOINTS:", JSON.stringify(responseData.report.checkpoints, null, 2));
      console.log("FINDINGS:", JSON.stringify(responseData.report.findings, null, 2));
      
    } catch (e) {
      // Ignore
    }
  }
}

runEval();
