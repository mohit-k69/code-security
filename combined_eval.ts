import { DEFAULT_ROUTING_RULES } from "./supabase/functions/analyze-repository/orchestrator/router/defaultRoutingRules.ts";
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

function routeTier1(content: string): string[] {
  const selectedIds = new Set<string>();
  const input = content.toLowerCase();
  const contentToMatch = input.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
  
  for (const rule of DEFAULT_ROUTING_RULES) {
    for (const pattern of rule.contentMatchPatterns) {
      if (contentToMatch.includes(pattern.toLowerCase())) {
        rule.checkpointIds.forEach(id => selectedIds.add(id));
        break;
      }
    }
  }
  return Array.from(selectedIds);
}

const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/evaluate-tier2-test";

async function fetchTier2(snippet: string): Promise<string[]> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-bypass': 'true'
      },
      body: JSON.stringify({ snippet })
    });
    if (!res.ok) return [];
    const parsed = await res.json();
    return parsed.checkpoints || [];
  } catch {
    return [];
  }
}

function calcMetrics(name: string, predictions: {expected: string[], actual: string[]}[]) {
  let tp = 0, fp = 0, fn = 0;
  
  for (const p of predictions) {
    const expected = p.expected;
    const actual = p.actual;
    
    const hits = expected.filter(cp => actual.includes(cp));
    const missed = expected.filter(cp => !actual.includes(cp));
    const unnecessary = actual.filter(cp => !expected.includes(cp));
    
    tp += hits.length;
    fn += missed.length;
    fp += unnecessary.length;
  }
  
  const precision = tp + fp > 0 ? (tp / (tp + fp)).toFixed(2) : "0.00";
  const recall = tp + fn > 0 ? (tp / (tp + fn)).toFixed(2) : "0.00";
  
  return { name, precision, recall, fp, fn };
}

async function runEval() {
  console.log("Fetching Tier-2 results...");
  const fetchPromises = data.map(c => fetchTier2(c.snippet));
  const tier2Responses = await Promise.all(fetchPromises);
  
  const resultsA = [];
  const resultsB = [];
  const resultsC = [];
  const resultsD = [];

  let tier2SelectiveInvocations = 0;

  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    const expected = EXPECTED_SEMANTICS[c.id] || [];
    
    const tier1 = routeTier1(c.snippet);
    const tier2 = tier2Responses[i];
    
    const union = Array.from(new Set([...tier1, ...tier2]));
    
    let selective = tier1;
    if (tier1.length === 0) {
      selective = tier2;
      tier2SelectiveInvocations++;
    }

    resultsA.push({ expected, actual: tier1 });
    resultsB.push({ expected, actual: tier2 });
    resultsC.push({ expected, actual: union });
    resultsD.push({ expected, actual: selective });
  }

  const metricsA = calcMetrics("A) Tier 1 Only", resultsA);
  const metricsB = calcMetrics("B) Tier 2 Only", resultsB);
  const metricsC = calcMetrics("C) Tier 1 + Tier 2 Union", resultsC);
  const metricsD = calcMetrics("D) Tier 1 + Selective Tier 2", resultsD);

  console.table([metricsA, metricsB, metricsC, metricsD]);

  console.log("\n=== POLICY D INVOCATION RATES ===");
  console.log(`Cases routing to Tier 2: ${tier2SelectiveInvocations} out of ${data.length} (${(tier2SelectiveInvocations/data.length*100).toFixed(1)}%)`);
  
  const costPerT2 = 0.000057;
  const selectiveRate = tier2SelectiveInvocations / data.length;
  
  console.log("\n=== ESTIMATED COST (Selective Tier 2) ===");
  console.log(`1,000 scans: $${(1000 * selectiveRate * costPerT2).toFixed(4)}`);
  console.log(`10,000 scans: $${(10000 * selectiveRate * costPerT2).toFixed(4)}`);
  console.log(`100,000 scans: $${(100000 * selectiveRate * costPerT2).toFixed(4)}`);

  console.log("\n=== ESTIMATED COST (Union - Always run Tier 2) ===");
  console.log(`1,000 scans: $${(1000 * costPerT2).toFixed(4)}`);
  console.log(`10,000 scans: $${(10000 * costPerT2).toFixed(4)}`);
  console.log(`100,000 scans: $${(100000 * costPerT2).toFixed(4)}`);
}

runEval().catch(console.error);
