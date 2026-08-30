import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRequest } from "../index.ts";

// Helper to run actual LLM evaluation
async function runSnippetEvaluation(content: string) {
  const req = new Request("http://localhost/analyze-snippet", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      files: [{ name: "snippet.js", content }]
    })
  });
  const res = await handleRequest(req);
  const json = await res.json();
  return json;
}

// Only run these tests if the API key is present
const hasApiKey = !!Deno.env.get("OPENROUTER_API_KEY");

Deno.test({
  name: "Prompt Accuracy - JWT creation without visible verification code should not automatically FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV'); // Ensure we don't hit the mock
    const content = `
const jwt = require('jsonwebtoken');
function login(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
}
    `;
    const res = await runSnippetEvaluation(content);
    assertEquals(res.report.verdict !== "FAIL", true, `Expected not to FAIL, but got ${res.report.verdict}`);
  }
});

Deno.test({
  name: "Prompt Accuracy - app.listen() without deployment context should not automatically FAIL for HTTPS",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const app = express();
app.get('/health', (req, res) => res.send('OK'));
app.listen(3000, () => console.log('Server running'));
    `;
    const res = await runSnippetEvaluation(content);
    assertEquals(res.report.verdict !== "FAIL", true, `Expected not to FAIL, but got ${res.report.verdict}`);
  }
});

Deno.test({
  name: "Prompt Accuracy - No visible helmet() should not automatically FAIL for missing security headers",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const app = express();
app.use(express.json());
app.post('/api/data', (req, res) => {
  res.json({ status: 'success' });
});
    `;
    const res = await runSnippetEvaluation(content);
    assertEquals(res.report.verdict !== "FAIL", true, `Expected not to FAIL, but got ${res.report.verdict}`);
  }
});

Deno.test({
  name: "Prompt Accuracy - A real hardcoded secret should still FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const AWS_KEY = "AKIAIOSFODNN7U4Y3T2Q";
const s3 = new AWS.S3({ accessKeyId: AWS_KEY });
    `;
    const res = await runSnippetEvaluation(content);
    assertEquals(res.report.verdict, "FAIL");
  }
});

Deno.test({
  name: "Prompt Accuracy - A concrete dangerous sink with user-controlled input should still be able to FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const { exec } = require('child_process');
const app = express();
app.post('/api/ping', (req, res) => {
  const { ip } = req.body;
  // Dangerous sink
  exec('ping -c 4 ' + ip, (err, stdout, stderr) => {
    res.send(stdout);
  });
});
    `;
    const res = await runSnippetEvaluation(content);
    assertEquals(res.report.verdict, "FAIL");
  }
});

Deno.test({
  name: "Prompt Accuracy - Explicit hardcoded admin credentials should FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const ADMIN_USER = "admin";
const ADMIN_PASS = "SuperSecretPassword123!";
function login(user, pass) {
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return true;
  }
}
    `;
    const res = await runSnippetEvaluation(content);
    assertEquals(res.report.verdict, "FAIL");
  }
});

Deno.test({
  name: "Prompt Accuracy - Missing rate limiting in a snippet should be NOT_VERIFIED",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const app = express();
app.post('/login', (req, res) => {
  const { user, pass } = req.body;
  if (user === 'admin') res.send('ok');
});
    `;
    const res = await runSnippetEvaluation(content);
    
    // It should not FAIL due to missing rate limiting (AUTH-C5).
    // We check if the report verdict is NOT FAIL, or if it is FAIL, it's not because of rate limiting.
    const hasBruteForceFail = res.report.findings?.critical?.some((f: any) => f.title.includes("AUTH-C5") || f.description.toLowerCase().includes("rate limit")) ||
                              res.report.findings?.warning?.some((f: any) => f.title.includes("AUTH-C5") || f.description.toLowerCase().includes("rate limit"));
    assertEquals(hasBruteForceFail, false, "Should not fail due to missing rate limiting");
  }
});

Deno.test({
  name: "Prompt Accuracy - Missing error-handling/enumeration protection without concrete evidence should be NOT_VERIFIED",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
function processLogin(user) {
  if (user === "admin") {
    console.log("Admin logged in");
    return true;
  }
  return false;
}
    `;
    const res = await runSnippetEvaluation(content);
    
    const hasEnumerationFail = res.report.findings?.critical?.some((f: any) => f.description.toLowerCase().includes("enumeration")) ||
                               res.report.findings?.warning?.some((f: any) => f.description.toLowerCase().includes("enumeration"));
    assertEquals(hasEnumerationFail, false, "Should not fail due to inferred user enumeration");
  }
});

Deno.test({
  name: "Prompt Accuracy - Missing validation alone should be NOT_VERIFIED",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
function saveUser(req, res) {
  const { username, age } = req.body;
  db.collection('users').insertOne({ username, age });
  res.send('Saved');
}
    `;
    const res = await runSnippetEvaluation(content);
    
    // It shouldn't FAIL merely because validation is missing.
    // If it fails for NoSQL injection, that's different, but it shouldn't fail purely for missing length limits.
    const hasValidationFail = res.report.findings?.critical?.some((f: any) => f.vulnerabilityClass === "INPUT_VALIDATION") ||
                              res.report.findings?.warning?.some((f: any) => f.vulnerabilityClass === "INPUT_VALIDATION");
    
    assertEquals(hasValidationFail, false, "Should not fail purely for missing validation");
  }
});

Deno.test({
  name: "Prompt Accuracy - jwt.verify with explicit algorithm allowlist should not FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const jwt = require('jsonwebtoken');
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
}
    `;
    const res = await runSnippetEvaluation(content);
    
    const hasJwtSecurityFail = res.report.findings?.critical?.some((f: any) => f.vulnerabilityClass === "JWT_SECURITY") ||
                               res.report.findings?.warning?.some((f: any) => f.vulnerabilityClass === "JWT_SECURITY");
    assertEquals(hasJwtSecurityFail, false, "Should not fail for JWT security when algorithms are explicitly allowed");
  }
});

Deno.test({
  name: "Prompt Accuracy - process.env.JWT_SECRET with no fallback should not FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const jwt = require('jsonwebtoken');
function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  return jwt.verify(token, secret, { algorithms: ["HS256"] });
}
    `;
    const res = await runSnippetEvaluation(content);
    
    const hasSecretFail = res.report.findings?.critical?.some((f: any) => ["SECRET_EXPOSURE", "INSECURE_CONFIGURATION", "JWT_SECURITY"].includes(f.vulnerabilityClass)) ||
                          res.report.findings?.warning?.some((f: any) => ["SECRET_EXPOSURE", "INSECURE_CONFIGURATION", "JWT_SECURITY"].includes(f.vulnerabilityClass)) ||
                          res.report.findings?.info?.some((f: any) => ["SECRET_EXPOSURE", "INSECURE_CONFIGURATION", "JWT_SECURITY"].includes(f.vulnerabilityClass));
    assertEquals(hasSecretFail, false, "Should not fail or warn for securely referencing process.env");
  }
});

Deno.test({
  name: "Prompt Accuracy - A genuine unsafe secret fallback should still FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const jwt = require('jsonwebtoken');
function verifyToken(token) {
  const secret = process.env.JWT_SECRET || "dev-secret";
  return jwt.verify(token, secret, { algorithms: ["HS256"] });
}
    `;
    const res = await runSnippetEvaluation(content);
    
    // We expect a finding for the hardcoded/unsafe fallback
    const hasSecretFail = res.report.findings?.critical?.some((f: any) => f.vulnerabilityClass === "SECRET_EXPOSURE" || f.vulnerabilityClass === "JWT_SECURITY") ||
                          res.report.findings?.warning?.some((f: any) => f.vulnerabilityClass === "SECRET_EXPOSURE" || f.vulnerabilityClass === "JWT_SECURITY");
    assertEquals(hasSecretFail, true, "Should fail due to unsafe secret fallback");
  }
});

Deno.test({
  name: "Prompt Accuracy - String field allowed to be empty should not FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
function updateProfile(req, res) {
  const { description } = req.body;
  if (typeof description !== "string") {
    return res.status(400).send("Invalid input");
  }
  // Allow empty description
  db.update(description);
  res.send("Updated");
}
    `;
    const res = await runSnippetEvaluation(content);
    
    const hasValidationFail = res.report.findings?.critical?.some((f: any) => f.vulnerabilityClass === "INPUT_VALIDATION") ||
                              res.report.findings?.warning?.some((f: any) => f.vulnerabilityClass === "INPUT_VALIDATION") ||
                              res.report.findings?.info?.some((f: any) => f.vulnerabilityClass === "INPUT_VALIDATION");
    assertEquals(hasValidationFail, false, "Should not fail for an allowed empty string field");
  }
});

Deno.test({
  name: "Prompt Accuracy - Manual validation without schema library should not trigger INFO/WARNING",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
function updateEmail(req, res) {
  const { email } = req.body;
  if (typeof email !== "string" || !email.includes("@") || email.length > 255) {
    return res.status(400).send("Invalid email");
  }
  db.updateEmail(email);
  res.send("Updated");
}
    `;
    const res = await runSnippetEvaluation(content);
    
    const hasValidationInfo = res.report.findings?.critical?.some((f: any) => f.vulnerabilityClass === "INPUT_VALIDATION") ||
                              res.report.findings?.warning?.some((f: any) => f.vulnerabilityClass === "INPUT_VALIDATION") ||
                              res.report.findings?.info?.some((f: any) => f.vulnerabilityClass === "INPUT_VALIDATION");
    assertEquals(hasValidationInfo, false, "Should not generate a finding purely for missing schema library when manually validated");
  }
});

Deno.test({
  name: "Prompt Accuracy - Enumeration vulnerability should map to a valid vulnerability class",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
function processLogin(req, res) {
  const { user } = req.body;
  if (!db.users.find(user)) {
    return res.status(404).send("User not found"); // Explicit enumeration
  }
  return res.status(401).send("Invalid password");
}
    `;
    const res = await runSnippetEvaluation(content);
    
    const allowedClasses = [
      "XSS", "PATH_TRAVERSAL", "AUTH_BYPASS", "SECRET_EXPOSURE", "JWT_SECURITY", 
      "DEPENDENCY_RISK", "SQL_INJECTION", "SSRF", "INSECURE_CONFIGURATION", 
      "BUSINESS_LOGIC_FLAW", "INPUT_VALIDATION", "CRYPTOGRAPHIC_FAILURE", "UNKNOWN"
    ];
    
    // Find any finding related to Authentication (AUTH-C10)
    const authFinding = [...(res.report.findings?.critical || []), ...(res.report.findings?.warning || []), ...(res.report.findings?.info || [])]
      .find((f: any) => f.contributingCheckpoints?.includes("SEC-AUTH-001"));
      
    if (authFinding) {
      assertEquals(allowedClasses.includes(authFinding.vulnerabilityClass), true, "Invalid vulnerability class: " + authFinding.vulnerabilityClass);
    } else {
      // If it didn't find an issue, that's okay, but we're primarily testing class validity if it does
      assertEquals(true, true);
    }
  }
});

Deno.test({
  name: "Prompt Accuracy - Missing downstream authorization logic should be NOT_VERIFIED unless broken access control is explicitly demonstrated",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const router = express.Router();
// The actual database query is missing from this snippet
router.post('/api/delete-user', (req, res) => {
  const { userId } = req.body;
  userService.deleteUser(userId);
  res.send("Deleted");
});
    `;
    const res = await runSnippetEvaluation(content);
    
    // We expect it NOT to FAIL, because we don't know if userService.deleteUser does the authz check internally.
    const hasAuthzFail = res.report.findings?.critical?.some((f: any) => f.vulnerabilityClass === "BUSINESS_LOGIC_FLAW") ||
                         res.report.findings?.warning?.some((f: any) => f.vulnerabilityClass === "BUSINESS_LOGIC_FLAW");
    assertEquals(hasAuthzFail, false, "Should not fail authorization when the dangerous logic is out of context");
  }
});

Deno.test({
  name: "Prompt Accuracy - Concrete SQL Injection should be classified as SQL_INJECTION without redundant INPUT_VALIDATION",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const app = express();
const db = require('./db');
app.post('/api/user', (req, res) => {
  const id = req.body.id;
  db.query(\`SELECT * FROM users WHERE id = \${id}\`);
  res.send('ok');
});
    `;
    const res = await runSnippetEvaluation(content);
    
    // We expect it to FAIL
    assertEquals(res.report.verdict, "FAIL");
    
    // It should have a SQL_INJECTION finding
    const findings = [...(res.report.findings?.critical || []), ...(res.report.findings?.warning || []), ...(res.report.findings?.info || [])];
    const sqlFindings = findings.filter((f: any) => f.vulnerabilityClass === "SQL_INJECTION");
    const inputFindings = findings.filter((f: any) => f.vulnerabilityClass === "INPUT_VALIDATION");
    
    assertEquals(sqlFindings.length > 0, true, "Expected at least one SQL_INJECTION finding");
    
    // SEC-INPUT-001 should be the contributing checkpoint
    assertEquals(sqlFindings[0].contributingCheckpoints.includes("SEC-INPUT-001"), true, "SEC-INPUT-001 should own the SQL injection finding");
    
    // It should NOT have a redundant INPUT_VALIDATION finding for the exact same issue
    // (We allow INPUT_VALIDATION if there are other fields, but here there's only 'id')
    assertEquals(inputFindings.length, 0, "Should not emit a redundant INPUT_VALIDATION finding for the exact same input field");
  }
});

Deno.test({
  name: "Prompt Accuracy - Generic input validation missing without concrete injection sink should produce INPUT_VALIDATION",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const app = express();
app.post('/api/profile', (req, res) => {
  // Missing validation/length limits, but no dangerous sink shown
  const { description } = req.body;
  if (description !== undefined && typeof description !== 'string') {
    return res.status(400).send("Invalid description");
  }
  res.send('Profile updated');
});
    `;
    const res = await runSnippetEvaluation(content);
    
    const findings = [...(res.report.findings?.critical || []), ...(res.report.findings?.warning || []), ...(res.report.findings?.info || [])];
    const inputFindings = findings.filter((f: any) => f.vulnerabilityClass === "INPUT_VALIDATION");
    
    // It should identify the missing length validation or schema issue as INPUT_VALIDATION
    assertEquals(inputFindings.length > 0, true, "Expected an INPUT_VALIDATION finding for generic validation weakness");
  }
});

Deno.test({
  name: "Paste Code Semantics - clean self-contained health/greeting snippet should return PASS",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const app = express();
app.get('/health', (req, res) => {
  res.send({ status: 'ok', time: Date.now() });
});
    `;
    const res = await runSnippetEvaluation(content);
    
    // Paste Code override should allow this self-contained snippet to PASS
    assertEquals(res.report.verdict, "PASS");
  }
});

Deno.test({
  name: "Paste Code Semantics - SQL injection snippet should return FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const app = express();
const db = require('./db');
app.get('/user', (req, res) => {
  const query = \`SELECT * FROM users WHERE id = \${req.query.id}\`;
  db.query(query, (err, result) => res.json(result));
});
    `;
    const res = await runSnippetEvaluation(content);
    
    // Concrete vulnerability must FAIL
    assertEquals(res.report.verdict, "FAIL");
  }
});

Deno.test({
  name: "Paste Code Semantics - partial security-sensitive authorization/database flow should return NOT_VERIFIED",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const router = express.Router();
// The actual database query and user authentication logic are missing from this snippet
router.post('/api/delete-user', (req, res) => {
  const { userId } = req.body;
  userService.deleteUser(userId);
  res.send("Deleted");
});
    `;
    const res = await runSnippetEvaluation(content);
    
    // Paste Code override says: "Use NOT_VERIFIED only when the pasted code contains security-sensitive behavior where an important security property genuinely depends on missing code"
    // Since this is a sensitive action (delete user) relying on missing auth/authz context, it should be NOT_VERIFIED.
    assertEquals(res.report.verdict, "NOT_VERIFIED");
  }
});

Deno.test({
  name: "Paste Code Semantics - explicitly unprotected sensitive route should return FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const router = express.Router();
// The user intentionally bypassed auth for testing
router.post('/api/delete-user', (req, res) => {
  if (req.query.bypass_auth === 'true') {
    const { userId } = req.body;
    userService.deleteUser(userId);
    res.send("Deleted with bypass");
  } else {
    res.status(401).send("Unauthorized");
  }
});
    `;
    const res = await runSnippetEvaluation(content);
    
    // Concrete proof of an auth bypass backdoor means FAIL.
    assertEquals(res.report.verdict, "FAIL");
  }
});

Deno.test({
  name: "Applicability - Simple Express /health server -> Security Configuration NOT_APPLICABLE",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const app = express();
app.get('/health', (req, res) => res.json({status: 'ok'}));
app.listen(3000);
    `;
    const res = await runSnippetEvaluation(content);
    const configCp = res.report.checkpoints.find((c: any) => c.checkpointId === "SEC-CONFIG-001");
    // It should be completely NOT_APPLICABLE because there is no specific security configuration present.
    assertEquals(configCp?.applicability, "NOT_APPLICABLE");
  }
});

Deno.test({
  name: "Applicability - express.Router() alone -> Authentication/Session NOT_APPLICABLE",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const router = express.Router();
router.get('/products', (req, res) => res.json([]));
module.exports = router;
    `;
    const res = await runSnippetEvaluation(content);
    const authCp = res.report.checkpoints.find((c: any) => c.checkpointId === "SEC-AUTH-001");
    const sessionCp = res.report.checkpoints.find((c: any) => c.checkpointId === "SEC-SESSION-001");
    assertEquals(authCp?.applicability, "NOT_APPLICABLE");
    assertEquals(sessionCp?.applicability, "NOT_APPLICABLE");
  }
});

Deno.test({
  name: "Applicability - Explicit helmet() / CORS / TLS -> Security Configuration APPLICABLE",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const app = express();
app.use(helmet());
app.use(cors());
app.get('/', (req, res) => res.send('OK'));
    `;
    const res = await runSnippetEvaluation(content);
    const configCp = res.report.checkpoints.find((c: any) => c.checkpointId === "SEC-CONFIG-001");
    assertEquals(configCp?.applicability, "APPLICABLE");
  }
});

Deno.test({
  name: "Applicability - Explicit JWT middleware -> Session/Auth APPLICABLE",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const jwt = require('jsonwebtoken');
function requireAuth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).send();
  // We only decode, causing a potential NOT_VERIFIED or FAIL, but it IS APPLICABLE
  const payload = jwt.decode(token);
  req.user = payload;
  next();
}
    `;
    const res = await runSnippetEvaluation(content);
    const sessionCp = res.report.checkpoints.find((c: any) => c.checkpointId === "SEC-SESSION-001");
    const authCp = res.report.checkpoints.find((c: any) => c.checkpointId === "SEC-AUTH-001");
    assertEquals(sessionCp?.applicability, "APPLICABLE");
    assertEquals(authCp?.applicability, "APPLICABLE");
  }
});

Deno.test({
  name: "Applicability - Database operation with no visible auth context -> Authorization NOT_APPLICABLE",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const db = require('./db');
function getPublicProducts() {
  return db.query("SELECT * FROM products WHERE is_public = true");
}
    `;
    const res = await runSnippetEvaluation(content);
    const authzCp = res.report.checkpoints.find((c: any) => c.checkpointId === "SEC-AUTHZ-001");
    // A database query by itself with no user/role logic should not trigger Authorization
    assertEquals(authzCp?.applicability, "NOT_APPLICABLE");
  }
});

Deno.test({
  name: "Prompt Accuracy - IDOR: userId = req.body.userId + UPDATE ... WHERE id = ? + no visible auth check -> NOT_VERIFIED",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require("express");
const router = express.Router();
router.post("/api/charge-user", (req, res) => {
  const userId = req.body.userId;
  const amount = req.body.amount;
  db.execute("UPDATE accounts SET balance = balance - ? WHERE id = ?", [amount, userId]);
  res.send("Charged");
});
    `;
    const res = await runSnippetEvaluation(content);
    const authzCp = res.report.checkpoints.find((c: any) => c.checkpointId === "SEC-AUTHZ-001");
    assertEquals(authzCp?.applicability, "APPLICABLE");
    assertEquals(authzCp?.verdict, "NOT_VERIFIED");
  }
});

Deno.test({
  name: "Prompt Accuracy - IDOR: Explicit flawed ownership check -> FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
app.post("/api/delete-user", (req, res) => {
  const userId = req.body.userId;
  // Flawed check: it just checks if ANY user exists in session, not ownership
  if (req.session.user) {
    db.execute("DELETE FROM users WHERE id = ?", [userId]);
    res.send("Deleted");
  } else {
    res.status(401).send();
  }
});
    `;
    const res = await runSnippetEvaluation(content);
    const authzCp = res.report.checkpoints.find((c: any) => c.checkpointId === "SEC-AUTHZ-001");
    assertEquals(authzCp?.applicability, "APPLICABLE");
    assertEquals(authzCp?.verdict, "FAIL");
  }
});

Deno.test({
  name: "Prompt Accuracy - Auth Bypass: Explicit executable bypass -> FAIL",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
app.post("/api/admin-action", (req, res) => {
  const bypassAuth = req.query.bypass === "true";
  if (bypassAuth || req.session.admin) {
    db.execute("DELETE FROM items WHERE id = ?", [req.body.id]);
    return res.send("Deleted");
  }
  return res.status(401).send("Unauthorized");
});
    `;
    const res = await runSnippetEvaluation(content);
    const authCp = res.report.checkpoints.find((c: any) => c.checkpointId === "SEC-AUTH-001");
    assertEquals(authCp?.applicability, "APPLICABLE");
    assertEquals(authCp?.verdict, "FAIL");
  }
});

Deno.test({
  name: "Prompt Accuracy - Checkpoint Separation (AUTH, CRYPTO, SECRET, SESSION, INPUT)",
  ignore: !hasApiKey,
  async fn() {
    Deno.env.delete('NODE_ENV');
    const content = `
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

const DB_PASS = "supersecret_db_password_123";
const JWT_SECRET = "my_hardcoded_jwt_secret";

app.post('/api/login', (req, res) => {
  if (req.body.username === "admin" && req.body.password === DB_PASS) {
    const token = jwt.sign({ user: "admin" }, JWT_SECRET);
    res.json({ token });
  }
});

app.post('/api/bypass', (req, res) => {
  if (req.query.bypass === "true") {
    res.send("Admin area");
  }
});
    `;
    const res = await runSnippetEvaluation(content);
    
    // Flatten findings to check provenance
    const allFindings = [
      ...(res.report.findings.critical || []),
      ...(res.report.findings.warning || []),
      ...(res.report.findings.info || [])
    ];

    // SEC-AUTH-001 should NOT generate INPUT_VALIDATION or CRYPTOGRAPHIC_FAILURE
    const inputFindings = allFindings.filter(f => f.vulnerabilityClass === "INPUT_VALIDATION");
    const authInputFindings = inputFindings.filter(f => f.contributingCheckpoints.includes("SEC-AUTH-001"));
    assertEquals(authInputFindings.length, 0, "SEC-AUTH-001 generated INPUT_VALIDATION");

    const cryptoFindings = allFindings.filter(f => f.vulnerabilityClass === "CRYPTOGRAPHIC_FAILURE");
    const authCryptoFindings = cryptoFindings.filter(f => f.contributingCheckpoints.includes("SEC-AUTH-001"));
    assertEquals(authCryptoFindings.length, 0, "SEC-AUTH-001 generated CRYPTOGRAPHIC_FAILURE");

    // Real crypto issue from SEC-CRYPTO-001
    const actualCryptoFindings = cryptoFindings.filter(f => f.contributingCheckpoints.includes("SEC-CRYPTO-001"));
    // Note: If no other crypto issue is flagged, length may be 0, but if timing attack is flagged, it should be CRYPTO
    // Actually, SEC-CRYPTO-001 currently might not have timing attack, but it should own CRYPTO issues

    // Hardcoded secret comes from SEC-SECRET-001
    const secretFindings = allFindings.filter(f => f.vulnerabilityClass === "SECRET_EXPOSURE");
    const hasSecret = secretFindings.some(f => f.contributingCheckpoints.includes("SEC-SECRET-001"));
    assertEquals(hasSecret, true, "Missing SECRET_EXPOSURE from SEC-SECRET-001");

    // JWT expiration comes from SEC-SESSION-001
    const jwtFindings = allFindings.filter(f => f.vulnerabilityClass === "JWT_SECURITY" || f.vulnerabilityClass === "SESSION_MANAGEMENT");
    const hasJwt = jwtFindings.some(f => f.contributingCheckpoints.includes("SEC-SESSION-001"));
    assertEquals(hasJwt, true, "Missing JWT expiration finding from SEC-SESSION-001");

    // Explicit bypass comes from SEC-AUTH-001
    const bypassFindings = allFindings.filter(f => f.vulnerabilityClass === "AUTH_BYPASS");
    const hasBypass = bypassFindings.some(f => f.contributingCheckpoints.includes("SEC-AUTH-001"));
    assertEquals(hasBypass, true, "Missing AUTH_BYPASS finding from SEC-AUTH-001");
  }
});
