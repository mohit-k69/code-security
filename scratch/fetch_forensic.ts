const mismatches = [
  "tc_012", "tc_013", "tc_015", "tc_031", "tc_032", "tc_033", "tc_037", "tc_038",
  "tc_040", "tc_041", "tc_042", "tc_043", "tc_044", "tc_047", "tc_048", "tc_052",
  "tc_063", "tc_065", "tc_069", "tc_074", "tc_075", "tc_076", "tc_077", "tc_079",
  "tc_080", "tc_085", "tc_086", "tc_087", "tc_089", "tc_091", "tc_092", "tc_093",
  "tc_098", "tc_100"
];

const data = JSON.parse(await Deno.readTextFile("eval_braintrust_100_cases.json"));
const targetCases = data.filter((tc: any) => mismatches.includes(tc.id));
const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet";

async function fetchTraces() {
  const traces = [];
  
  for (const tc of targetCases) {
    console.log(`Fetching ${tc.id}...`);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-bypass': 'true'
        },
        body: JSON.stringify({
          files: [{ name: "snippet.js", content: tc.snippet }]
        })
      });
      
      if (!res.ok) {
        console.error(`Error for ${tc.id}: ${res.status}`);
        continue;
      }
      
      const responseData = await res.json();
      traces.push({
        id: tc.id,
        expected: tc.expected,
        actualVerdict: responseData.report?.verdict,
        reportCheckpoints: responseData.report?.checkpoints,
        aggregatedFindings: responseData.report?.findings,
        rawResults: responseData.rawResults
      });
    } catch (e: any) {
      console.error(`Exception for ${tc.id}:`, e.message);
    }
  }
  
  await Deno.writeTextFile("forensic_traces.json", JSON.stringify(traces, null, 2));
  console.log("Done fetching 34 traces.");
}

fetchTraces();
