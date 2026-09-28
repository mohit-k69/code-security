import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FindingGuardrail } from "../../analyze-repository/services/FindingGuardrail.ts";
import type { CheckpointResult, CheckpointFinding } from "../../analyze-repository/services/CheckpointRunner.ts";

function createMockResult(findings: CheckpointFinding[]): CheckpointResult {
  return {
    checkpointId: "TEST-001",
    checkpointName: "Test Review",
    verdict: "FAIL",
    applicability: "APPLICABLE",
    confidence: 0.9,
    summary: "Mock summary",
    findings,
    status: "completed",
    execution: {
      executionTimeMs: 100,
      llmDurationMs: 100,
      model: "test-model",
      timestamp: "2026-08-19T00:00:00Z"
    }
  };
}

function createMockFinding(
  criterionId: string,
  vulnerabilityClass: any,
  severity: "critical" | "warning" | "info",
  title: string,
  description: string,
  snippet: string,
  explanation: string
): CheckpointFinding {
  return {
    findingId: "f1",
    criterionId,
    vulnerabilityClass,
    cwes: [],
    primaryLocation: { file: "test.js", line: 1 },
    title,
    severity,
    description,
    suggestion: "Fix it",
    evidence: [{ file: "test.js", line: 1, snippet, explanation }]
  };
}

Deno.test("Guardrail: Suppress algorithms: ['HS256'] false critical finding", () => {
  const finding = createMockFinding(
    "AUTH-C8",
    "JWT_SECURITY",
    "critical",
    "JWT algorithms issue",
    "The none algorithm is accepted.",
    "jwt.verify(token, secret, { algorithms: ['HS256'] });",
    "It allows none."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  // It should be suppressed completely
  assertEquals(guarded.findings.length, 0);
  assertEquals(guarded.verdict, "NOT_VERIFIED");
});

Deno.test("Guardrail: Suppress process.env.JWT_SECRET without unsafe fallback (entropy warning)", () => {
  const finding = createMockFinding(
    "AUTH-C8",
    "JWT_SECURITY",
    "warning",
    "Weak JWT Secret",
    "The secret lacks sufficient entropy and validation.",
    "const secret = process.env.JWT_SECRET;",
    "No length check is performed on the secret."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
  assertEquals(guarded.verdict, "NOT_VERIFIED");
});

Deno.test("Guardrail: Preserve process.env.JWT_SECRET || 'default-secret' (unsafe fallback)", () => {
  const finding = createMockFinding(
    "AUTH-C8",
    "JWT_SECURITY",
    "warning",
    "Unsafe secret fallback",
    "The secret falls back to a hardcoded string.",
    "const secret = process.env.JWT_SECRET || 'default-secret';",
    "This is an unsafe fallback."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 1);
});

Deno.test("Guardrail: Suppress INPUT-C6 optional schema absence", () => {
  const finding = createMockFinding(
    "INPUT-C6",
    "INPUT_VALIDATION",
    "info",
    "Missing Schema Validation",
    "The application does not use a schema validation library.",
    "const { email } = req.body;",
    "Missing zod or joi."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
  assertEquals(guarded.verdict, "NOT_VERIFIED");
});

Deno.test("Guardrail: Preserve genuine unsafe input/schema behavior", () => {
  const finding = createMockFinding(
    "INPUT-C1",
    "INPUT_VALIDATION",
    "critical",
    "No Input Validation",
    "Input is directly evaluated without any validation.",
    "eval(req.body.code);",
    "This is dangerous."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 1);
});

Deno.test("Guardrail: Preserve genuine hardcoded secret", () => {
  const finding = createMockFinding(
    "SECRET-C1",
    "SECRET_EXPOSURE",
    "critical",
    "Hardcoded Secret",
    "Secret exposed in code.",
    "const apiKey = 'sk_live_12345';",
    "Secret string."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 1);
});

Deno.test("Guardrail: Preserve dangerous sink with user-controlled input", () => {
  const finding = createMockFinding(
    "XSS-C1",
    "XSS",
    "critical",
    "XSS Vulnerability",
    "Input rendered directly to HTML.",
    "element.innerHTML = req.query.name;",
    "Data flows to innerHTML."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 1);
});

Deno.test("Guardrail: Suppress absence of context (WARNING)", () => {
  const finding = createMockFinding(
    "AUTHZ-C1",
    "BUSINESS_LOGIC_FLAW",
    "warning",
    "Potential IDOR",
    "Authorization logic is not shown in the snippet.",
    "// Assume DB update",
    "Cannot be determined from the snippet."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
  assertEquals(guarded.verdict, "NOT_VERIFIED");
});

Deno.test("Guardrail: Suppress absence of context (CRITICAL)", () => {
  const finding = createMockFinding(
    "AUTHZ-C1",
    "BUSINESS_LOGIC_FLAW",
    "critical",
    "Potential IDOR",
    "Authorization logic is not shown in the snippet.",
    "// Assume DB update",
    "Cannot be determined from the snippet."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
  assertEquals(guarded.verdict, "NOT_VERIFIED");
});

Deno.test("Guardrail: Preserve concrete CRITICAL vulnerability with evidence in supplied code", () => {
  const finding = createMockFinding(
    "INJ-C1",
    "SQL_INJECTION",
    "critical",
    "SQL Injection",
    "Input is directly concatenated into a SQL query.",
    "const query = `SELECT * FROM users WHERE id = ${req.body.id}`;",
    "Concrete evidence of injection vulnerability."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 1);
});

Deno.test("Guardrail: Suppress Truthiness/Falsy Hallucination (Rule 5)", () => {
  const finding = createMockFinding(
    "AUTH-C8",
    "INSECURE_CONFIGURATION",
    "warning",
    "Weak JWT Secret",
    "While the code checks for !secret, an empty string '' would pass this check but still be insecure.",
    "if (!secret) return res.status(500).send('Server Error');",
    "This line only checks if the secret is null, not an empty string."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
});

Deno.test("Guardrail: Suppress Optional Input Hardening (Rule 6)", () => {
  const finding = createMockFinding(
    "INPUT-C1",
    "INPUT_VALIDATION",
    "warning",
    "Missing Length Limit",
    "The description lacks maximum length validation.",
    "if (typeof description !== 'string') return;",
    "No length limit."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
});

Deno.test("Guardrail: Suppress Operational/Debugging Preference (Rule 7)", () => {
  const finding = createMockFinding(
    "AUTH-C1",
    "BUSINESS_LOGIC_FLAW",
    "info",
    "Generic Error Message",
    "Returns a generic Forbidden message.",
    "res.status(403).send('Forbidden');",
    "Makes debugging harder as you cannot differentiate between errors."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
});

Deno.test("Guardrail: Preserve Genuine Information Disclosure", () => {
  const finding = createMockFinding(
    "AUTH-C1",
    "INFORMATION_DISCLOSURE",
    "warning",
    "Verbose Error Message",
    "Returns internal database stack trace to user.",
    "res.status(500).send(dbError.stack);",
    "Exposes internal details."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 1);
});

Deno.test("Guardrail: Do not alter errors/NOT_VERIFIED", () => {
  const result: CheckpointResult = {
    checkpointId: "TEST-001",
    checkpointName: "Test",
    verdict: "NOT_VERIFIED",
    applicability: "UNKNOWN",
    confidence: 0,
    summary: "LLM response is not valid JSON",
    findings: [],
    status: "error",
    error: "Parse error",
    execution: {
      executionTimeMs: 100,
      llmDurationMs: 100,
      model: "test-model",
      timestamp: "2026-08-19T00:00:00Z"
    }
  };
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.status, "error");
  assertEquals(guarded.verdict, "NOT_VERIFIED");
  assertEquals(guarded.error, "Parse error");
});

Deno.test("Guardrail: Suppress parameterized SQL injection false positive", () => {
  const finding = createMockFinding(
    "INPUT-C2",
    "SQL_INJECTION",
    "critical",
    "SQL Injection Risk",
    "The implementation is out of context.",
    "db.execute('SELECT * FROM users WHERE id = ?', [req.body.id]);",
    "It uses a parameter but who knows."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
});

Deno.test("Guardrail: Preserve unsafe string concatenation SQL injection", () => {
  const finding = createMockFinding(
    "INPUT-C2",
    "SQL_INJECTION",
    "critical",
    "SQL Injection Risk",
    "Unsafe string concatenation.",
    "db.execute('SELECT * FROM users WHERE id = ' + req.body.id);",
    "Direct interpolation."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 1);
});

Deno.test("Guardrail: Suppress generic missing validation on req.body assignment", () => {
  const finding = createMockFinding(
    "INPUT-C1",
    "INPUT_VALIDATION",
    "critical",
    "Missing Validation",
    "Input extracted directly from req.body without validation.",
    "const id = req.body.id;",
    "Extracted directly from request body."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
});

Deno.test("Guardrail: Suppress generic missing validation on req.body destructuring", () => {
  const finding = createMockFinding(
    "INPUT-C1",
    "INPUT_VALIDATION",
    "critical",
    "Missing Validation",
    "Input extracted directly from req.body without validation.",
    "const { userId } = req.body;",
    "Extracted directly from request body."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
});

Deno.test("Guardrail: Suppress false IDOR on partial DB operation with no visible authorization", () => {
  const finding = createMockFinding(
    "AUTHZ-C1",
    "BUSINESS_LOGIC_FLAW",
    "critical",
    "IDOR",
    "Direct use of req.body.userId in UPDATE without auth",
    "const userId = req.body.userId;\ndb.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, userId]);",
    "Extracted directly from request body."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
  assertEquals(guarded.verdict, "NOT_VERIFIED");
});

Deno.test("Guardrail: Suppress false IDOR with abbreviated evidence but DB operation in full context", () => {
  const finding = createMockFinding(
    "AUTHZ-C1",
    "AUTH_BYPASS",
    "critical",
    "IDOR",
    "Uses req.body.userId",
    "const userId = req.body.userId;", // LLM cited ONLY extraction
    "Extracted directly from request body."
  );
  const result = createMockResult([finding]);
  
  const mockContextPackage: any = {
    changedFiles: [{
      path: "test.js", // Matches finding.primaryLocation.file from createMockFinding
      content: "const userId = req.body.userId;\ndb.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, userId]);"
    }]
  };

  const guarded = FindingGuardrail.applyGuardrails(result, mockContextPackage);
  
  assertEquals(guarded.findings.length, 0);
  assertEquals(guarded.verdict, "NOT_VERIFIED");
});

Deno.test("Guardrail: Preserve bypassAuth query parameter AUTH_BYPASS", () => {
  const finding = createMockFinding(
    "AUTH-C1",
    "AUTH_BYPASS",
    "critical",
    "Auth Bypass",
    "Bypass via query param",
    "const bypassAuth = req.query.bypass === 'true';",
    "Explicit bypass logic."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 1);
});

Deno.test("Guardrail: Preserve req.body.admin trusted as authorization state", () => {
  const finding = createMockFinding(
    "AUTHZ-C1",
    "BUSINESS_LOGIC_FLAW",
    "critical",
    "Client-controlled Role",
    "Trusts req.body.admin",
    "const isAdmin = req.body.admin;",
    "Extracts admin flag directly from client."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 1);
});

Deno.test("Guardrail: Preserve explicit flawed ownership comparison", () => {
  const finding = createMockFinding(
    "AUTHZ-C1",
    "AUTH_BYPASS",
    "critical",
    "Flawed Check",
    "Checks session but not ownership",
    "if (req.session.user) {\n  db.execute('DELETE FROM users WHERE id = ?', [req.body.userId]);\n}",
    "Flawed logic checking existence rather than ownership."
  );
  const result = createMockResult([finding]);
  
  const mockContextPackage: any = {
    changedFiles: [{
      path: "test.js",
      content: "if (req.session.user) {\n  db.execute('DELETE FROM users WHERE id = ?', [req.body.userId]);\n}"
    }]
  };

  const guarded = FindingGuardrail.applyGuardrails(result, mockContextPackage);
  
  assertEquals(guarded.findings.length, 1);
});

Deno.test("Guardrail: Suppress generic if (userId) with no auth semantics", () => {
  const finding = createMockFinding(
    "AUTHZ-C1",
    "BUSINESS_LOGIC_FLAW",
    "critical",
    "IDOR",
    "If check without auth semantics",
    "if (req.body.userId) {\n  db.execute('DELETE FROM users WHERE id = ?', [req.body.userId]);\n}",
    "Missing proper auth."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
});

Deno.test("Guardrail: Suppress generic missing validation on parameterized SQL", () => {
  const finding = createMockFinding(
    "INPUT-C1",
    "INPUT_VALIDATION",
    "warning",
    "Missing Validation",
    "Input used in database without any validation.",
    "db.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, userId]);",
    "Extracted directly from request body."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 0);
});

Deno.test("Guardrail: Preserve generic missing validation if unsafe concatenation", () => {
  const finding = createMockFinding(
    "INPUT-C1",
    "INPUT_VALIDATION",
    "warning",
    "Missing Validation",
    "Input used in database without any validation.",
    "db.execute('UPDATE accounts SET balance = balance - ' + amount + ' WHERE id = ' + userId);",
    "Extracted directly from request body."
  );
  const result = createMockResult([finding]);
  const guarded = FindingGuardrail.applyGuardrails(result);
  
  assertEquals(guarded.findings.length, 1);
});

Deno.test("Guardrail: Suppress JWT_SECURITY on req.headers.authorization reading by itself", () => {
  const finding = createMockFinding(
    "SESSION-C2",
    "JWT_SECURITY",
    "warning",
    "Insecure Token Extraction",
    "Reading req.headers.authorization without verification on extraction line.",
    "const authHeader = req.headers.authorization;\nconst token = authHeader.split(' ')[1];",
    "Token is extracted from header."
  );
  const result = createMockResult([finding]);
  const mockContextPackage: any = {
    changedFiles: [{
      path: "test.js",
      content: "const authHeader = req.headers.authorization;\nconst token = authHeader.split(' ')[1];\nconsole.log(token);"
    }]
  };
  const guarded = FindingGuardrail.applyGuardrails(result, mockContextPackage);
  
  assertEquals(guarded.findings.length, 0);
  assertEquals(guarded.verdict, "NOT_VERIFIED");
});

Deno.test("Guardrail: Suppress JWT_SECURITY on /admin route declaration by itself", () => {
  const finding = createMockFinding(
    "SESSION-C2",
    "JWT_SECURITY",
    "critical",
    "Unprotected Admin Route",
    "Route /admin is declared without authentication middleware.",
    "app.get('/admin', (req, res) => { res.send('admin'); });",
    "The /admin endpoint is missing auth middleware."
  );
  const result = createMockResult([finding]);
  const mockContextPackage: any = {
    changedFiles: [{
      path: "test.js",
      content: "app.get('/admin', (req, res) => {\n  res.send('admin');\n});"
    }]
  };
  const guarded = FindingGuardrail.applyGuardrails(result, mockContextPackage);
  
  assertEquals(guarded.findings.length, 0);
  assertEquals(guarded.verdict, "NOT_VERIFIED");
});

Deno.test("Guardrail: Refine JWT_SECURITY location from header extraction to jwt.decode trust sink", () => {
  const fileContent = [
    "app.get('/profile', (req, res) => {",
    "  const token = req.headers.authorization.split(' ')[1];", // line 2
    "  const decoded = jwt.decode(token);",                     // line 3
    "  req.user = decoded;",                                    // line 4
    "  res.json(req.user);",
    "});"
  ].join("\n");

  const finding: CheckpointFinding = {
    findingId: "f-jwt-1",
    criterionId: "SESSION-C2",
    vulnerabilityClass: "JWT_SECURITY" as any,
    cwes: ["CWE-347"],
    primaryLocation: { file: "test.js", line: 2 }, // incorrectly pointing to header extraction
    title: "Unverified JWT Decoded",
    severity: "critical",
    description: "Token is decoded without signature verification.",
    suggestion: "Use jwt.verify instead of jwt.decode.",
    evidence: [{
      file: "test.js",
      line: 2,
      snippet: "const token = req.headers.authorization.split(' ')[1];",
      explanation: "Extracts authorization header"
    }]
  };

  const result = createMockResult([finding]);
  const mockContextPackage: any = {
    changedFiles: [{
      path: "test.js",
      content: fileContent
    }]
  };

  const guarded = FindingGuardrail.applyGuardrails(result, mockContextPackage);
  
  assertEquals(guarded.findings.length, 1);
  assertEquals(guarded.findings[0].primaryLocation.line, 3); // Refined to line 3 (jwt.decode)
  assertEquals(guarded.findings[0].evidence[0].line, 3);
  assertEquals(guarded.findings[0].evidence[0].snippet, "const decoded = jwt.decode(token);");
});

Deno.test("Guardrail: Regression - Multi-endpoint file preserves jwt.decode, suppresses /admin route and header extraction", () => {
  // Controlled multi-endpoint file containing:
  // 1. A real jwt.decode() vulnerability
  // 2. An /admin route declaration
  // 3. req.headers.authorization extraction
  const fileContent = [
    "// Endpoint 1: Vulnerable JWT decode endpoint",
    "app.get('/profile', (req, res) => {",
    "  const auth = req.headers.authorization;",
    "  const token = auth.split(' ')[1];",
    "  const decoded = jwt.decode(token);",
    "  req.user = decoded;",
    "  res.json(req.user);",
    "});",
    "",
    "// Endpoint 2: Route declaration without JWT operations",
    "app.get('/admin', (req, res) => {",
    "  res.send('admin dashboard');",
    "});",
    "",
    "// Endpoint 3: Benign authorization header extraction",
    "app.get('/public', (req, res) => {",
    "  const token = req.headers.authorization;",
    "  res.send('ok');",
    "});"
  ].join("\n");

  const mockContextPackage: any = {
    changedFiles: [{
      path: "test-vulnerabilities.js",
      content: fileContent
    }]
  };

  // 1. Finding on actual jwt.decode() vulnerability (line 5)
  const realFinding: CheckpointFinding = {
    findingId: "f-jwt-real",
    criterionId: "SESSION-C2",
    vulnerabilityClass: "JWT_SECURITY" as any,
    cwes: ["CWE-347"],
    primaryLocation: { file: "test-vulnerabilities.js", line: 5 },
    title: "Unverified JWT Decoded",
    severity: "critical",
    description: "Token is decoded without signature verification.",
    suggestion: "Use jwt.verify instead.",
    evidence: [{
      file: "test-vulnerabilities.js",
      line: 5,
      snippet: "const decoded = jwt.decode(token);",
      explanation: "Unverified token decoded"
    }]
  };

  // 2. Spurious finding on /admin route declaration (line 11)
  const routeFinding: CheckpointFinding = {
    findingId: "f-jwt-admin",
    criterionId: "SESSION-C2",
    vulnerabilityClass: "JWT_SECURITY" as any,
    cwes: ["CWE-347"],
    primaryLocation: { file: "test-vulnerabilities.js", line: 11 },
    title: "Missing JWT Authentication on /admin",
    severity: "warning",
    description: "The /admin route lacks JWT authentication.",
    suggestion: "Add JWT middleware.",
    evidence: [{
      file: "test-vulnerabilities.js",
      line: 11,
      snippet: 'app.get("/admin", (req, res) => {',
      explanation: "Admin route without verification"
    }]
  };

  // 3. Spurious finding on req.headers.authorization extraction (line 17)
  const headerFinding: CheckpointFinding = {
    findingId: "f-jwt-header",
    criterionId: "SESSION-C2",
    vulnerabilityClass: "JWT_SECURITY" as any,
    cwes: ["CWE-347"],
    primaryLocation: { file: "test-vulnerabilities.js", line: 17 },
    title: "Insecure JWT Extraction",
    severity: "warning",
    description: "Authorization header read without validation.",
    suggestion: "Validate token.",
    evidence: [{
      file: "test-vulnerabilities.js",
      line: 17,
      snippet: "const token = req.headers.authorization;",
      explanation: "Authorization header read"
    }]
  };

  // Run all three findings through the guardrail simultaneously
  const result = createMockResult([realFinding, routeFinding, headerFinding]);
  const guarded = FindingGuardrail.applyGuardrails(result, mockContextPackage);

  // Exactly one finding must remain: jwt.decode()
  // /admin route declaration and authorization header extraction must be suppressed
  assertEquals(guarded.findings.length, 1);
  assertEquals(guarded.findings[0].findingId, "f-jwt-real");
  assertEquals(guarded.findings[0].primaryLocation.line, 5);
  assertEquals(guarded.findings[0].evidence[0].snippet, "const decoded = jwt.decode(token);");
});


Deno.test("Guardrail: Regression - Multi-endpoint file preserves real AUTH_BYPASS login flow, suppresses spurious ones", () => {
  const fileContent = [
    "// Endpoint 1: Admin route without visible middleware",
    "app.get('/admin', (req, res) => {",
    "  res.send('admin dashboard');",
    "});",
    "",
    "// Endpoint 2: Vulnerable login flow (AUTH_BYPASS)",
    "app.post('/login', (req, res) => {",
    "  const user = getUserByUsername(req.body.username);",
    "  if (user) {",
    "    const token = createSessionToken(user.id);",
    "    res.json({ token });",
    "  }",
    "});",
    "",
    "// Endpoint 3: Standalone user fetch without auth decision",
    "app.get('/user/:id', (req, res) => {",
    "  const user = getUserByUsername(req.params.id);",
    "  res.json(user);",
    "});"
  ].join("\n");

  const mockContextPackage: any = {
    changedFiles: [{
      path: "test-auth.js",
      content: fileContent
    }]
  };

  // 1. Spurious finding on /admin route
  const adminFinding: CheckpointFinding = {
    findingId: "f-admin",
    criterionId: "AUTH-C1",
    vulnerabilityClass: "AUTH_BYPASS" as any,
    cwes: ["CWE-285"],
    primaryLocation: { file: "test-auth.js", line: 2 },
    title: "Missing Authentication on /admin",
    severity: "warning",
    description: "The /admin route lacks authentication middleware.",
    suggestion: "Add authentication middleware.",
    evidence: [{
      file: "test-auth.js",
      line: 2,
      snippet: "app.get('/admin', (req, res) => {",
      explanation: "Admin route without verification"
    }]
  };

  // 2. Real finding on login flow (placed initially on the input extraction)
  const loginFinding: CheckpointFinding = {
    findingId: "f-login",
    criterionId: "AUTH-C1",
    vulnerabilityClass: "AUTH_BYPASS" as any,
    cwes: ["CWE-287"],
    primaryLocation: { file: "test-auth.js", line: 8 },
    title: "Authentication Bypass in Login",
    severity: "critical",
    description: "User is authenticated without verifying a password.",
    suggestion: "Verify password before issuing token.",
    evidence: [{
      file: "test-auth.js",
      line: 8,
      snippet: "const user = getUserByUsername(req.body.username);",
      explanation: "Extracts user"
    }]
  };

  // 3. Spurious finding on standalone fetch
  const fetchFinding: CheckpointFinding = {
    findingId: "f-fetch",
    criterionId: "AUTH-C1",
    vulnerabilityClass: "AUTH_BYPASS" as any,
    cwes: ["CWE-285"],
    primaryLocation: { file: "test-auth.js", line: 16 },
    title: "Missing Authentication on User Fetch",
    severity: "warning",
    description: "User data is fetched without authentication.",
    suggestion: "Authenticate before fetching.",
    evidence: [{
      file: "test-auth.js",
      line: 16,
      snippet: "const user = getUserByUsername(req.params.id);",
      explanation: "Fetches user"
    }]
  };

  const result = createMockResult([adminFinding, loginFinding, fetchFinding]);
  const guarded = FindingGuardrail.applyGuardrails(result, mockContextPackage);

  // Exactly one finding must remain: login flow
  assertEquals(guarded.findings.length, 1);
  assertEquals(guarded.findings[0].findingId, "f-login");
  
  // It should have been refined from line 8 down to the token creation (line 10)
  assertEquals(guarded.findings[0].primaryLocation.line, 10);
  assertEquals(guarded.findings[0].evidence[0].snippet.trim(), "const token = createSessionToken(user.id);");
});
