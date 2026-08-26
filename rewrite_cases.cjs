const fs = require('fs');

const data = JSON.parse(fs.readFileSync('eval_braintrust_70_new_cases.json', 'utf8'));

// tc_033: Rewrite commented-secret scenario -> critical
const tc033 = data.find(c => c.id === 'tc_033');
tc033.snippet = "function init() {\n  // Never commit this!\n  // AWS_SECRET_ACCESS_KEY=\"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\"\n  console.log(\"Initialized\");\n}";
tc033.expected.severities = ["critical"];
tc033.expected.lines = [3];
tc033.rationale = "Hardcoded AWS secret inside a comment, explicitly critical as it's exposed credentials.";

// tc_041: IDOR -> BUSINESS_LOGIC_FLAW
const tc041 = data.find(c => c.id === 'tc_041');
tc041.expected.vulnerabilityClasses = ["BUSINESS_LOGIC_FLAW"];
tc041.rationale = "IDOR: Trusting req.params.id without checking ownership, explicitly BUSINESS_LOGIC_FLAW per AuthorizationSpec.";

// tc_053: Missing HttpOnly -> jwt.verify ignoreExpiration
const tc053 = data.find(c => c.id === 'tc_053');
tc053.snippet = "function verifyToken(token, secret) {\n  return jwt.verify(token, secret, { ignoreExpiration: true });\n}";
tc053.expected.vulnerabilityClasses = ["JWT_SECURITY"];
tc053.rationale = "Explicitly disabling JWT expiration checks during verification. Class is unambiguously JWT_SECURITY.";

// tc_059: Upload filename -> critical
const tc059 = data.find(c => c.id === 'tc_059');
tc059.expected.severities = ["critical"];
tc059.rationale = "Path traversal in file uploads is highly exploitable, defaults to critical severity.";

// tc_065: Weak PBKDF2 -> DES encryption (critical)
const tc065 = data.find(c => c.id === 'tc_065');
tc065.snippet = "function encryptData(data, key) {\n  const cipher = crypto.createCipher('des', key);\n  return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');\n}";
tc065.expected.severities = ["critical"];
tc065.expected.lines = [2];
tc065.rationale = "Use of broken DES encryption algorithm. Cryptography defaults to critical for blatantly broken algorithms.";

// tc_071: Helmet frameguard -> CORS origin: * (explicitly critical in spec)
const tc071 = data.find(c => c.id === 'tc_071');
tc071.snippet = "app.use(cors({ origin: '*' }));";
tc071.expected.severities = ["critical"];
tc071.rationale = "CORS origin: '*' is explicitly mandated as critical by SecurityConfigurationSpec, regardless of credentials.";

// tc_074: Stack trace leak -> libxmljs XXE (deterministic critical)
const tc074 = data.find(c => c.id === 'tc_074');
tc074.snippet = "const libxmljs = require('libxmljs');\nconst xmlDoc = libxmljs.parseXmlString(req.body.xml, { noent: true });";
tc074.expected.severities = ["critical"];
tc074.rationale = "Enabling entity expansion (noent) in XML parsers is explicitly critical per SecurityConfigurationSpec.";

// tc_077: NoSQL Injection -> change endpoint to avoid AUTH_BYPASS overlap
const tc077 = data.find(c => c.id === 'tc_077');
tc077.snippet = "app.get('/api/products', async (req, res) => {\n  const products = await db.collection('products').find({ category: req.query.category }).toArray();\n  res.json(products);\n});";
tc077.rationale = "NoSQL injection on a non-auth endpoint to guarantee INPUT_VALIDATION class.";

// tc_090: Genuine two-finding aggregation (same line)
const tc090 = data.find(c => c.id === 'tc_090');
tc090.snippet = "app.get('/data', async (req, res) => {\n  const result = await db.query(`SELECT * FROM users WHERE token = '${req.query.token}' AND secret = 'sk_live_123456789'`);\n});";
tc090.expected.vulnerabilityClasses = ["SQL_INJECTION", "SECRET_EXPOSURE"];
tc090.rationale = "Exactly two independent vulnerabilities (SQLi and Hardcoded Secret) on the exact same line, with no unintended third finding.";

// tc_092: Explicit warning severity case (Client-only AuthZ)
const tc092 = data.find(c => c.id === 'tc_092');
tc092.snippet = "function AdminPanel() {\n  if (!localStorage.getItem('isAdmin')) {\n    return <div>Access Denied</div>;\n  }\n  return <AdminDashboard />;\n}";
tc092.expected.vulnerabilityClasses = ["BUSINESS_LOGIC_FLAW"];
tc092.expected.severities = ["warning"];
tc092.expected.lines = [2];
tc092.rationale = "Client-only authorization enforcement is explicitly defined as a warning severity in AuthorizationSpec.";

// tc_093: Explicit warning severity case (Missing AuthZ on read-only endpoint)
const tc093 = data.find(c => c.id === 'tc_093');
tc093.snippet = "app.get('/api/internal/users', (req, res) => {\n  const users = db.getInternalUsers();\n  res.json(users);\n});";
tc093.expected.vulnerabilityClasses = ["BUSINESS_LOGIC_FLAW"];
tc093.expected.severities = ["warning"];
tc093.expected.lines = [2];
tc093.rationale = "Missing authorization on a non-destructive read operation is explicitly defined as a warning severity in AuthorizationSpec.";

fs.writeFileSync('eval_braintrust_70_new_cases.json', JSON.stringify(data, null, 2));
console.log('Successfully updated the 11 questionable cases.');
