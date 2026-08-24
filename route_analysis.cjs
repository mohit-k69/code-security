const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Desktop/code-security/eval_braintrust_30_cases.json', 'utf8'));

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

const VULN_TO_CP = {
  'SQL_INJECTION': 'SEC-INPUT-001',
  'XSS': 'SEC-XSS-001',
  'PATH_TRAVERSAL': 'SEC-FILE-001',
  'AUTH_BYPASS': 'SEC-AUTH-001',
  'AUTHORIZATION_FAILURE': 'SEC-AUTHZ-001',
  'JWT_SECURITY': 'SEC-SESSION-001',
  'SECRET_EXPOSURE': 'SEC-SECRET-001',
  'CRYPTOGRAPHIC_FAILURE': 'SEC-CRYPTO-001',
  'INPUT_VALIDATION': 'SEC-INPUT-001'
};

const results = data.map(c => {
  const executed = routeSnippet(c.snippet);
  let expectedCp = c.expected.vulnerabilityClasses ? c.expected.vulnerabilityClasses.map(v => VULN_TO_CP[v] || v) : [];
  
  // If it's a PASS/NOT_VERIFIED without vulns, derive from tags
  if (expectedCp.length === 0) {
    const derived = new Set();
    c.tags.forEach(t => {
      if (t.includes('sql') || t.includes('injection')) derived.add('SEC-INPUT-001');
      if (t.includes('xss')) derived.add('SEC-XSS-001');
      if (t.includes('path') || t.includes('file')) derived.add('SEC-FILE-001');
      if (t.includes('auth')) derived.add('SEC-AUTH-001'); // crude mapping
      if (t.includes('jwt') || t.includes('session')) derived.add('SEC-SESSION-001');
      if (t.includes('secret') || t.includes('credential')) derived.add('SEC-SECRET-001');
      if (t.includes('crypto') || t.includes('hash')) derived.add('SEC-CRYPTO-001');
      if (t.includes('config') || t.includes('cors')) derived.add('SEC-CONFIG-001');
    });
    expectedCp = Array.from(derived);
  }

  // Deduplicate expectedCp
  expectedCp = Array.from(new Set(expectedCp));

  let correct = true;
  let issue = "";
  
  if (c.expected.verdict === 'FAIL') {
    // All expected CPs must be executed
    const missed = expectedCp.filter(cp => !executed.includes(cp));
    if (missed.length > 0) {
      correct = false;
      issue = `Missed expected checkpoints: ${missed.join(', ')}`;
    }
  } else {
    // It's a PASS or NOT_VERIFIED.
    // If executed is empty, but we expected a CP based on tags, it's skipped.
    // However, if the snippet doesn't have keywords, skipping is fine?
    // Wait, if a PASS snippet doesn't trigger a checkpoint, it's technically correctly skipped to save LLM cost.
    // But if it has the keyword, it gets routed and then LLM decides PASS. Both are technically "correct" from an overarching view, but let's see.
    if (executed.length === 0 && expectedCp.length > 0) {
      // Skipped
      issue = "Skipped completely (but is a clean/partial case).";
      correct = false; // Is this considered "incorrectly skipped"?
    } else if (executed.length > 0) {
       const overRouted = executed.filter(cp => !expectedCp.includes(cp));
       if (overRouted.length > 0) {
          // issue = `Over-routed to: ${overRouted.join(', ')}`;
       }
    }
  }

  return {
    id: c.id,
    expectedCategory: expectedCp.join(', '),
    executed: executed.join(', '),
    isFail: c.expected.verdict === 'FAIL',
    tags: c.tags.join(', ')
  };
});
console.table(results);
