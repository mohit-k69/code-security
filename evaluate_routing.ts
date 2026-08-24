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

function routeSnippet(content: string) {
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

let totalTruePositives = 0;
let totalFalsePositives = 0;
let totalFalseNegatives = 0;

let correctlyRouted = 0;
let underRouted = 0;
let overRouted = 0;
let intentionallyZero = 0;

const results = data.map((c: any) => {
  const actual = routeSnippet(c.snippet);
  const expected = EXPECTED_SEMANTICS[c.id] || [];
  
  const missed = expected.filter(cp => !actual.includes(cp));
  const unnecessary = actual.filter(cp => !expected.includes(cp));
  const hits = expected.filter(cp => actual.includes(cp));
  
  totalTruePositives += hits.length;
  totalFalsePositives += unnecessary.length;
  totalFalseNegatives += missed.length;
  
  let classification = "";
  if (expected.length === 0 && actual.length === 0) {
    classification = "Intentionally Zero";
    intentionallyZero++;
  } else if (missed.length === 0 && unnecessary.length === 0) {
    classification = "Correctly Routed";
    correctlyRouted++;
  } else if (missed.length > 0) {
    classification = "Under-Routed";
    underRouted++;
  } else if (unnecessary.length > 0 && missed.length === 0) {
    classification = "Over-Routed";
    overRouted++;
  }

  let casePrecision = actual.length > 0 ? (hits.length / actual.length).toFixed(2) : (expected.length === 0 ? "1.00" : "0.00");
  let caseRecall = expected.length > 0 ? (hits.length / expected.length).toFixed(2) : (actual.length === 0 ? "1.00" : "0.00");

  return {
    case: c.id,
    expected: expected.join(', ') || 'NONE',
    actual: actual.join(', ') || 'NONE',
    missedAny: missed.length > 0 ? 'Yes' : 'No',
    unnecessaryAny: unnecessary.length > 0 ? 'Yes' : 'No',
    precision: casePrecision,
    recall: caseRecall,
    classification: classification
  };
});

const globalPrecision = (totalTruePositives / (totalTruePositives + totalFalsePositives)).toFixed(2);
const globalRecall = (totalTruePositives / (totalTruePositives + totalFalseNegatives)).toFixed(2);

console.log("=== ROUTING EVALUATION SUMMARY ===\n");
console.log(`Correctly Routed: ${correctlyRouted}`);
console.log(`Intentionally Zero (Baseline): ${intentionallyZero}`);
console.log(`Under-Routed (Security Miss): ${underRouted}`);
console.log(`Over-Routed (Unnecessary Cost): ${overRouted}`);
console.log(`\nGlobal Precision: ${globalPrecision}`);
console.log(`Global Recall: ${globalRecall}`);
console.log("\n=== CASE BY CASE ===");
console.table(results);
