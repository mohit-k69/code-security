import data from "./eval_braintrust_30_cases.json" with { type: "json" };

const EXPECTED_SEMANTICS: Record<string, string[]> = {
  'tc_001': [],
  'tc_002': ['SEC-CRYPTO-001', 'SEC-AUTH-001'], 
  'tc_003': ['SEC-FILE-001'],
  'tc_004': ['SEC-SESSION-001', 'SEC-AUTH-001'],
  'tc_005': ['SEC-AUTHZ-001'],
  'tc_006': ['SEC-INPUT-001'],
  'tc_007': ['SEC-INPUT-001'],
  'tc_008': ['SEC-XSS-001'],
  'tc_009': ['SEC-FILE-001'],
  'tc_010': ['SEC-SECRET-001'],
  'tc_011': ['SEC-AUTH-001'],
  'tc_012': ['SEC-AUTHZ-001'],
  'tc_013': ['SEC-SESSION-001', 'SEC-SECRET-001'],
  'tc_014': ['SEC-CRYPTO-001'],
  'tc_015': ['SEC-CONFIG-001'],
  'tc_016': ['SEC-INPUT-001'],
  'tc_017': ['SEC-SECRET-001'],
  'tc_018': ['SEC-XSS-001'],
  'tc_019': ['SEC-INPUT-001'],
  'tc_020': ['SEC-CRYPTO-001'],
  'tc_021': ['SEC-FILE-001'],
  'tc_022': ['SEC-SECRET-001'],
  'tc_023': ['SEC-AUTH-001'],
  'tc_024': ['SEC-FILE-001'],
  'tc_025': ['SEC-AUTHZ-001'],
  'tc_026': ['SEC-CRYPTO-001'],
  'tc_027': ['SEC-AUTH-001'],
  'tc_028': ['SEC-SECRET-001'],
  'tc_029': ['SEC-INPUT-001', 'SEC-XSS-001'],
  'tc_030': ['SEC-CRYPTO-001', 'SEC-AUTH-001', 'SEC-SESSION-001', 'SEC-SECRET-001']
};

const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/evaluate-tier2-test";

async function runEval() {
  let totalTruePositives = 0;
  let totalFalsePositives = 0;
  let totalFalseNegatives = 0;
  let totalCost = 0;
  let totalLatencyMs = 0;
  let totalInvalidIds = 0;
  
  const results = [];

  console.log(`Starting strict-schema evaluation against ${API_URL} ...\n`);

  for (const c of data) {
    const expected = EXPECTED_SEMANTICS[c.id] || [];
    
    let actual: string[] = [];
    let errorStr = "";
    
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-bypass': 'true'
        },
        body: JSON.stringify({ snippet: c.snippet })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const parsed = await res.json();
      if (parsed.error) {
        throw new Error(parsed.error);
      }

      actual = parsed.checkpoints || [];
      const latency = parsed.latencyMs || 0;
      totalLatencyMs += latency;
      
      const invalidCount = parsed.invalidCount || 0;
      totalInvalidIds += invalidCount;

      const promptTokens = parsed.promptTokens || 300;
      const completionTokens = parsed.completionTokens || 20;
      totalCost += (promptTokens * 0.150 / 1_000_000) + (completionTokens * 0.600 / 1_000_000);
      
    } catch (e: any) {
      errorStr = e.message;
      actual = [];
    }

    const missed = expected.filter(cp => !actual.includes(cp));
    const unnecessary = actual.filter(cp => !expected.includes(cp));
    const hits = expected.filter(cp => actual.includes(cp));
    
    totalTruePositives += hits.length;
    totalFalsePositives += unnecessary.length;
    totalFalseNegatives += missed.length;
    
    results.push({
      case: c.id,
      expected: expected.join(', ') || 'NONE',
      actual: actual.join(', ') || (errorStr ? `ERROR: ${errorStr}` : 'NONE'),
      missed: missed.length > 0 ? 'Yes' : 'No',
      unnecessary: unnecessary.length > 0 ? 'Yes' : 'No',
    });
  }

  const globalPrecision = totalTruePositives + totalFalsePositives > 0 ? (totalTruePositives / (totalTruePositives + totalFalsePositives)).toFixed(2) : "0.00";
  const globalRecall = totalTruePositives + totalFalseNegatives > 0 ? (totalTruePositives / (totalTruePositives + totalFalseNegatives)).toFixed(2) : "0.00";

  console.log("=== TIER 2 SEMANTIC ROUTER EVALUATION (STRICT) ===");
  console.log(`Global Precision: ${globalPrecision}`);
  console.log(`Global Recall: ${globalRecall}`);
  console.log(`Invalid IDs Generated (filtered out): ${totalInvalidIds}`);
  console.log(`Average Latency: ${(totalLatencyMs / data.length).toFixed(0)} ms`);
  console.log(`Estimated Total Cost (30 snippets): $${totalCost.toFixed(6)}`);
  console.log("\n=== CASE RESULTS ===");
  console.table(results);
}

runEval().catch(console.error);
