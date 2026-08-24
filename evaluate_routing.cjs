const fs = require('fs');

const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Desktop/code-security/eval_braintrust_30_cases.json', 'utf8'));

// The true semantic expectation of which checkpoints SHOULD run for these snippets
// based on their actual content and testing goals, independent of the current router rules.
const EXPECTED_SEMANTICS = {
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
  'tc_016': ['SEC-INPUT-001'], // Command injection falls under input validation here
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

const DEFAULT_ROUTING_RULES = [
  { name: "Authentication", contentMatchPatterns: ["jwt.sign", "jwt.verify", "jsonwebtoken", "authenticate", "authorization", "session", "password"], checkpointIds: ["SEC-AUTH-001"] },
  { name: "Authorization", contentMatchPatterns: ["permission", "role", "deleteuser", "updateuser", "getuser", "createuser", "deleteaccount", "updateaccount", "getaccount", "/delete-user", "/update-user", "/delete-account", "/update-account", "userservice.", "accountservice.", "chargeuser", "/charge-user"], checkpointIds: ["SEC-AUTHZ-001"] },
  { name: "Input Validation", contentMatchPatterns: ["select ", "select * from", "insert into", "update ", "delete from", "db.query", "db.execute"], checkpointIds: ["SEC-INPUT-001"] },
  { name: "Secrets Management", contentMatchPatterns: ["secret", "token", "apikey"], checkpointIds: ["SEC-SECRET-001"] },
  { name: "Session & JWT", contentMatchPatterns: ["jwt.sign", "jwt.verify", "jsonwebtoken", "session"], checkpointIds: ["SEC-SESSION-001"] },
  { name: "Cryptography", contentMatchPatterns: ["crypto", "encrypt", "hash", "aes", "rsa"], checkpointIds: ["SEC-CRYPTO-001"] },
  { name: "Security Configuration", contentMatchPatterns: ["helmet(", "cors(", "tls.createserver", "https.createserver", "secure: true", "httponly: true", "x-frame-options", "x-xss-protection"], checkpointIds: ["SEC-CONFIG-001"] },
  { name: "Cross-Site Scripting (XSS)", contentMatchPatterns: ["innerhtml", "dangerouslysetinnerhtml", "res.send(html)", ".send(\"<", ".send('<", ".send(\`<"], checkpointIds: ["SEC-XSS-001"] },
  { name: "File & Path Security", contentMatchPatterns: ["fs.readfile", "fs.writefile", "fs.createwritestream", "multer", "upload"], checkpointIds: ["SEC-FILE-001"] },
  { name: "Supply Chain & Dependencies", contentMatchPatterns: ["package.json", "package-lock.json"], checkpointIds: ["SEC-SUPPLY-001"] },
];

function routeSnippet(content) {
  const selectedIds = new Set();
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

const results = data.map(c => {
  const actual = routeSnippet(c.snippet);
  const expected = EXPECTED_SEMANTICS[c.id] || [];
  
  // Calculate hits/misses for this case
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
    classification = "Under-Routed (Missed Expected)";
    underRouted++;
  } else if (unnecessary.length > 0 && missed.length === 0) {
    classification = "Over-Routed (Safe but Unnecessary)";
    overRouted++;
  }

  // Precision = true_positives / (true_positives + false_positives)
  // Recall = true_positives / (true_positives + false_negatives)
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

// Global Metrics
const globalPrecision = (totalTruePositives / (totalTruePositives + totalFalsePositives)).toFixed(2);
const globalRecall = (totalTruePositives / (totalTruePositives + totalFalseNegatives)).toFixed(2);

console.log("=== ROUTING EVALUATION SUMMARY ===\n");
console.log(`Correctly Routed: ${correctlyRouted}`);
console.log(`Intentionally Zero (Baseline): ${intentionallyZero}`);
console.log(`Under-Routed (Security Miss): ${underRouted}`);
console.log(`Over-Routed (Unnecessary Cost): ${overRouted}`);
console.log(`\nGlobal Precision (How many routed CPs were expected?): ${globalPrecision}`);
console.log(`Global Recall (How many expected CPs were routed?): ${globalRecall}`);
console.log("\n=== CASE BY CASE ===");
console.table(results);
