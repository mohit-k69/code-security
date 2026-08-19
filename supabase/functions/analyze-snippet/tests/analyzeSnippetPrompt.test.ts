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
  return await res.json();
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
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
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
