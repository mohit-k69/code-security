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

  let totalVerdict = 0;
  let totalClass = 0;
  let totalCount = 0;
  let totalSev = 0;
  let totalDedup = 0;
  let successCount = 0;
  let timeouts = 0;
  
  const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet";

  console.log(`Starting evaluation for ${cases.length} cases...`);

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const input = testCase.snippet;
    const expected = testCase.expected;

    try {
      const startTime = performance.now();
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

      if (!res.ok) {
        console.error(`Case ${i} failed: ${res.statusText}`);
        timeouts++;
        continue;
      }

      const responseData = await res.json();
      const output = responseData.report;

      const args = { expected, output };
      totalVerdict += verdictAccuracy(args);
      totalClass += findingClassAccuracy(args);
      totalCount += findingCountAccuracy(args);
      totalSev += severityAccuracy(args);
      totalDedup += deduplicationAccuracy(args);
      successCount++;
      
      console.log(`Case ${i} completed in ${Math.round(performance.now() - startTime)}ms`);
    } catch (e) {
      console.error(`Case ${i} error: ${e.message}`);
      timeouts++;
    }
  }

  if (successCount === 0) {
    console.log("No cases succeeded.");
    return;
  }

  console.log("\n--- Evaluation Results ---");
  console.log(`Total Cases Run: ${successCount}`);
  console.log(`Timeouts/Errors: ${timeouts}`);
  console.log(`Verdict Accuracy: ${(totalVerdict / successCount * 100).toFixed(2)}%`);
  console.log(`Finding Class Accuracy: ${(totalClass / successCount * 100).toFixed(2)}%`);
  console.log(`Finding Count Accuracy: ${(totalCount / successCount * 100).toFixed(2)}%`);
  console.log(`Severity Accuracy: ${(totalSev / successCount * 100).toFixed(2)}%`);
  console.log(`Deduplication Accuracy: ${(totalDedup / successCount * 100).toFixed(2)}%`);
  
  const overall = (totalVerdict + totalClass + totalCount + totalSev + totalDedup) / (5 * successCount);
  console.log(`Braintrust Overall Score: ${(overall * 100).toFixed(2)}%`);
}

runEval();
