const fs = require('fs');

// The logic from CheckpointRouter.ts and defaultRoutingRules.ts
const DEFAULT_ROUTING_RULES = [
  {
    name: "Authentication",
    contentMatchPatterns: [
      "jwt.sign", "jwt.verify", "jsonwebtoken", "authenticate", "authorization", "session", "password"
    ],
    checkpointIds: ["SEC-AUTH-001"],
  },
  {
    name: "Authorization",
    contentMatchPatterns: [
      "permission", "role",
      "deleteuser", "updateuser", "getuser", "createuser",
      "deleteaccount", "updateaccount", "getaccount",
      "/delete-user", "/update-user", "/delete-account", "/update-account",
      "userservice.", "accountservice.",
      "chargeuser", "/charge-user"
    ],
    checkpointIds: ["SEC-AUTHZ-001"],
  },
  {
    name: "Input Validation",
    contentMatchPatterns: [
      "select ", "select * from", "insert into", "update ", "delete from", "db.query", "db.execute"
    ],
    checkpointIds: ["SEC-INPUT-001"],
  },
  {
    name: "Secrets Management",
    contentMatchPatterns: [
      "secret", "token", "apikey"
    ],
    checkpointIds: ["SEC-SECRET-001"],
  },
  {
    name: "Session & JWT",
    contentMatchPatterns: [
      "jwt.sign", "jwt.verify", "jsonwebtoken", "session"
    ],
    checkpointIds: ["SEC-SESSION-001"],
  },
  {
    name: "Cryptography",
    contentMatchPatterns: [
      "crypto", "encrypt", "hash", "aes", "rsa"
    ],
    checkpointIds: ["SEC-CRYPTO-001"],
  },
  {
    name: "Security Configuration",
    contentMatchPatterns: [
      "helmet(", "cors(", "tls.createserver", "https.createserver", "secure: true", "httponly: true", "x-frame-options", "x-xss-protection"
    ],
    checkpointIds: ["SEC-CONFIG-001"],
  },
  {
    name: "Cross-Site Scripting (XSS)",
    contentMatchPatterns: [
      "innerhtml", "dangerouslysetinnerhtml", "res.send(html)",
      ".send(\"<", ".send('<", ".send(\`<"
    ],
    checkpointIds: ["SEC-XSS-001"],
  },
  {
    name: "File & Path Security",
    contentMatchPatterns: [
      "fs.readfile", "fs.writefile", "fs.createwritestream", "multer", "upload"
    ],
    checkpointIds: ["SEC-FILE-001"],
  },
  {
    name: "Supply Chain & Dependencies",
    contentMatchPatterns: [
      "package.json", "package-lock.json"
    ],
    checkpointIds: ["SEC-SUPPLY-001"],
  },
];

function routeSnippet(content) {
  const selectedIds = new Set();
  const input = content.toLowerCase();
  const contentToMatch = input.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
  
  for (const rule of DEFAULT_ROUTING_RULES) {
    for (const pattern of rule.contentMatchPatterns) {
      if (contentToMatch.includes(pattern.toLowerCase())) {
        for (const cpId of rule.checkpointIds) {
          selectedIds.add(cpId);
        }
        break;
      }
    }
  }
  return Array.from(selectedIds);
}

const data = JSON.parse(fs.readFileSync('/Users/mohitkaushal/Desktop/code-security/eval_braintrust_30_cases.json', 'utf8'));

const results = [];
for (const c of data) {
  const executed = routeSnippet(c.snippet);
  results.push({
    id: c.id,
    expectedVulns: c.expected.vulnerabilityClasses || [],
    expectedVerdict: c.expected.verdict,
    executed: executed
  });
}
console.log(JSON.stringify(results, null, 2));
