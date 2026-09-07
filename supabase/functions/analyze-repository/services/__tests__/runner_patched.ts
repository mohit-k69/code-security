
import assert from "node:assert";
const assertEquals = assert.deepStrictEqual;
const tests = [];
globalThis.Deno = {
  test: (name, fn) => { tests.push({name, fn}); }
};

import { CheckpointRunner } from "../CheckpointRunner.ts";
import type { ILLMProvider } from "../../orchestrator/providers/ILLMProvider.ts";
import type { SanitizedContextPackage } from "../types.ts";
import type { ReviewSpecification } from "../../prompts/specifications/ReviewSpecification.ts";

class MockProvider implements ILLMProvider {
  name = "MockProvider";
  constructor(private responseText: string) {}
  async generateContent(systemPrompt: string, userPrompt: string, model?: string): Promise<any> {
    return { text: this.responseText };
  }
}

const mockSpec: ReviewSpecification = {
  id: "TEST-1",
  name: "Test Spec",
  version: "1.0",
  category: "test",
  description: "Test",
  criteria: [],
  promptInstruction: ""
};

const mockContext: any = {
  packageId: "test",
  repository: "owner/repo",
  prNumber: 1,
  commitSha: "s",
  changedFiles: [],
  dependencies: [],
  metadata: { totalSecretsReplaced: 0, replacementTypes: {}, ignoredReplacements: 0, processingTimeMs: 0 }
};

function createMockResponse(cwesPayload: string): string {
  return `{
    "verdict": "FAIL",
    "confidence": 1.0,
    "summary": "Mock",
    "findings": [
      {
        "criterionId": "TEST-C1",
        "vulnerabilityClass": "JWT_SECURITY",
        ${cwesPayload}
        "primaryLocation": { "file": "test.ts", "line": 1 },
        "title": "Title",
        "severity": "critical",
        "description": "Desc",
        "suggestion": "Fix",
        "evidence": [
          { "file": "test.ts", "line": 1, "snippet": "code", "explanation": "expl" }
        ]
      }
    ]
  }`;
}

Deno.test("CheckpointRunner - valid single CWE -> preserved", async () => {
  const runner = new CheckpointRunner(new MockProvider(createMockResponse(`"cwes": ["CWE-798"],`)));
  const result = await runner.run(mockContext, "framework", mockSpec);
  assertEquals(result.findings[0].cwes, ["CWE-798"]);
});

Deno.test("CheckpointRunner - valid multiple CWEs -> preserved", async () => {
  const runner = new CheckpointRunner(new MockProvider(createMockResponse(`"cwes": ["CWE-798", "CWE-20"],`)));
  const result = await runner.run(mockContext, "framework", mockSpec);
  assertEquals(result.findings[0].cwes, ["CWE-798", "CWE-20"]);
});

Deno.test("CheckpointRunner - missing cwes -> normalized to []", async () => {
  const runner = new CheckpointRunner(new MockProvider(createMockResponse(``)));
  const result = await runner.run(mockContext, "framework", mockSpec);
  assertEquals(result.findings[0].cwes, []);
});

Deno.test("CheckpointRunner - malformed/non-string CWE entries -> ignored", async () => {
  const runner = new CheckpointRunner(new MockProvider(createMockResponse(`"cwes": ["CWE-798", 123, null, "CWE-20"],`)));
  const result = await runner.run(mockContext, "framework", mockSpec);
  assertEquals(result.findings[0].cwes, ["CWE-798", "CWE-20"]);
});

Deno.test("CheckpointRunner - existing findings without a reliable CWE -> still valid", async () => {
  const runner = new CheckpointRunner(new MockProvider(createMockResponse(`"cwes": [],`)));
  const result = await runner.run(mockContext, "framework", mockSpec);
  assertEquals(result.findings[0].cwes, []);
  assertEquals(result.findings[0].vulnerabilityClass, "JWT_SECURITY");
});

Deno.test("CheckpointRunner - Regression Test: tc_028 distinct secrets on different lines get distinct locations and IDs", async () => {
  const mockLLMResponse = `{
    "verdict": "FAIL",
    "confidence": 1.0,
    "summary": "Found secrets",
    "findings": [
      {
        "criterionId": "SECRET-C1",
        "vulnerabilityClass": "SECRET_EXPOSURE",
        "cwes": ["CWE-798"],
        "primaryLocation": { "file": "snippet.js", "line": 1 },
        "title": "Hardcoded DB Password",
        "severity": "critical",
        "description": "DB password is hardcoded",
        "suggestion": "Use env var",
        "evidence": [
          { "file": "snippet.js", "line": 1, "snippet": "const DB_PASSWORD = '...';", "explanation": "DB password" }
        ]
      },
      {
        "criterionId": "SECRET-C1",
        "vulnerabilityClass": "SECRET_EXPOSURE",
        "cwes": ["CWE-798"],
        "primaryLocation": { "file": "snippet.js", "line": 2 },
        "title": "Hardcoded API Key",
        "severity": "critical",
        "description": "API Key is hardcoded",
        "suggestion": "Use env var",
        "evidence": [
          { "file": "snippet.js", "line": 2, "snippet": "const API_KEY = '...';", "explanation": "API key" }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(mockContext, "framework", mockSpec);
  
  assertEquals(result.findings.length, 2, "Should return exactly 2 findings");
  
  const f1 = result.findings[0];
  const f2 = result.findings[1];
  
  assertEquals(f1.primaryLocation.line, 1);
  assertEquals(f2.primaryLocation.line, 2);
  
  // Their finding IDs MUST be distinct because they are on different lines
  assertEquals(f1.findingId !== f2.findingId, true, "Finding IDs should be strictly distinct for different primary lines");
});

Deno.test("CheckpointRunner - Regression Test: tc_012 visible route definition with requireAuth -> not suppressed", async () => {
  const tc012Context = {
    ...mockContext,
    changedFiles: [
      {
        path: "snippet.js",
        content: "app.post('/updateProfile', requireAuth, async (req, res) => {\\n  const targetUserId = req.body.userId;\\n  await db.users.update({ id: targetUserId, email: req.body.email });\\n  res.send('Updated');\\n});",
        deleted: false
      }
    ]
  };

  const mockLLMResponse = `{
    "verdict": "FAIL",
    "confidence": 1.0,
    "summary": "IDOR",
    "findings": [
      {
        "criterionId": "AUTHZ-C1",
        "vulnerabilityClass": "BUSINESS_LOGIC_FLAW",
        "primaryLocation": { "file": "snippet.js", "line": 3 },
        "title": "IDOR",
        "severity": "critical",
        "description": "IDOR",
        "suggestion": "Fix",
        "evidence": [
          { "file": "snippet.js", "line": 1, "snippet": "app.post('/updateProfile', requireAuth, async (req, res) => {", "explanation": "Route visible" },
          { "file": "snippet.js", "line": 3, "snippet": "await db.users.update({ id: targetUserId, email: req.body.email });", "explanation": "DB update" }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(tc012Context, "framework", mockSpec);
  
  assertEquals(result.verdict, "FAIL", "Should remain FAIL because explicit auth logic (requireAuth) is visible");
  assertEquals(result.findings.length, 1);
  assertEquals(result.findings[0].vulnerabilityClass, "BUSINESS_LOGIC_FLAW");
});

Deno.test("CheckpointRunner - Regression Test: visible /api/profile endpoint without auth check -> not suppressed", async () => {
  const profileContext = {
    ...mockContext,
    changedFiles: [
      {
        path: "routes.js",
        content: "app.post('/api/profile', async (req, res) => {\\n  const userId = req.body.userId;\\n  await db.users.update({ id: userId, email: req.body.email });\\n  res.send('Updated');\\n});",
        deleted: false
      }
    ]
  };

  const mockLLMResponse = `{
    "verdict": "FAIL",
    "confidence": 1.0,
    "summary": "Broken Access Control",
    "findings": [
      {
        "criterionId": "AUTHZ-C1",
        "vulnerabilityClass": "BUSINESS_LOGIC_FLAW",
        "primaryLocation": { "file": "routes.js", "line": 3 },
        "title": "Broken Access Control",
        "severity": "critical",
        "description": "User-controlled userId is used directly to update user profile without authorization.",
        "suggestion": "Verify user ownership.",
        "evidence": [
          { "file": "routes.js", "line": 1, "snippet": "app.post('/api/profile', async (req, res) => {", "explanation": "Route definition" },
          { "file": "routes.js", "line": 3, "snippet": "await db.users.update({ id: userId, email: req.body.email });", "explanation": "DB update" }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(profileContext, "framework", mockSpec);
  
  assertEquals(result.verdict, "FAIL", "Should remain FAIL because /api/profile endpoint is visible");
  assertEquals(result.findings.length, 1);
  assertEquals(result.findings[0].vulnerabilityClass, "BUSINESS_LOGIC_FLAW");
});

Deno.test("CheckpointRunner - Regression Test: partial function body IDOR -> suppressed to NOT_VERIFIED", async () => {
  const partialContext = {
    ...mockContext,
    changedFiles: [
      {
        path: "snippet.js",
        content: "async function updateUser(req, res) {\\n  const targetUserId = req.body.userId;\\n  await db.users.update({ id: targetUserId, email: req.body.email });\\n  res.send('Updated');\\n}",
        deleted: false
      }
    ]
  };

  const mockLLMResponse = `{
    "verdict": "FAIL",
    "confidence": 1.0,
    "summary": "IDOR",
    "findings": [
      {
        "criterionId": "AUTHZ-C1",
        "vulnerabilityClass": "BUSINESS_LOGIC_FLAW",
        "primaryLocation": { "file": "snippet.js", "line": 3 },
        "title": "IDOR",
        "severity": "critical",
        "description": "IDOR",
        "suggestion": "Fix",
        "evidence": [
          { "file": "snippet.js", "line": 3, "snippet": "await db.users.update({ id: targetUserId, email: req.body.email });", "explanation": "DB update" }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(partialContext, "framework", mockSpec);
  
  // Guardrail should suppress it because it's a DB operation with client ID, but NO explicit auth logic
  assertEquals(result.verdict, "NOT_VERIFIED", "Should be suppressed to NOT_VERIFIED due to missing explicit auth logic in partial snippet");
  assertEquals(result.findings.length, 0, "Finding should be dropped");
});

Deno.test("CheckpointRunner - Regression Test: safe JWT creation (tc_004) -> PASS", async () => {
  const mockLLMResponse = `{
    "verdict": "PASS",
    "applicability": "APPLICABLE",
    "confidence": 0.95,
    "summary": "JWT creation uses secure algorithm and expiration",
    "findings": []
  }`;
  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(mockContext, "framework", mockSpec);
  
  assertEquals(result.verdict, "PASS", "Should remain PASS when LLM determines visible code is safe");
});

Deno.test("CheckpointRunner - Regression Test: genuinely unseen security property -> NOT_VERIFIED", async () => {
  const mockLLMResponse = `{
    "verdict": "NOT_VERIFIED",
    "applicability": "UNKNOWN",
    "confidence": 0.8,
    "summary": "Cannot determine if auth middleware exists",
    "findings": []
  }`;
  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(mockContext, "framework", mockSpec);
  
  assertEquals(result.verdict, "NOT_VERIFIED", "Should preserve NOT_VERIFIED when LLM correctly identifies missing context");
});

Deno.test("CheckpointRunner - Regression Test: partial file-upload delegation (tc_024) -> NOT_VERIFIED with 0 findings", async () => {
  const partialContext = {
    ...mockContext,
    changedFiles: [
      {
        path: "snippet.js",
        content: "export const upload = async (req, res) => { return fileProcessor.handleUpload(req.file); };",
        deleted: false
      }
    ]
  };

  const mockLLMResponse = `{
    "verdict": "NOT_VERIFIED",
    "applicability": "UNKNOWN",
    "confidence": 0.8,
    "summary": "Cannot determine if fileProcessor validates extensions",
    "findings": []
  }`;
  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(partialContext, "framework", mockSpec);
  
  assertEquals(result.verdict, "NOT_VERIFIED", "Should preserve NOT_VERIFIED for delegated file upload");
  assertEquals(result.findings.length, 0, "Should have 0 findings for unseen controls");
});

Deno.test("CheckpointRunner - Regression Test: vulnerable JWT -> FAIL", async () => {
  const mockLLMResponse = `{
    "verdict": "FAIL",
    "applicability": "APPLICABLE",
    "confidence": 0.9,
    "summary": "JWT uses none algorithm",
    "findings": [
      {
        "criterionId": "SESSION-C1",
        "vulnerabilityClass": "JWT_SECURITY",
        "primaryLocation": { "file": "snippet.js", "line": 2 },
        "title": "Insecure JWT",
        "severity": "critical",
        "description": "Uses none algorithm",
        "suggestion": "Fix it",
        "evidence": [
          { "file": "snippet.js", "line": 2, "snippet": "jwt.sign({ id }, secret, { algorithm: 'none' })", "explanation": "none algo" }
        ]
      }
    ]
  }`;
  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(mockContext, "framework", mockSpec);
  
  assertEquals(result.verdict, "FAIL", "Should remain FAIL when concrete vulnerability is found");
});

Deno.test("CheckpointRunner - Regression Test: Hardcoded API key -> SECRET_EXPOSURE", async () => {
  const apiKeyContext = {
    ...mockContext,
    changedFiles: [
      {
        path: "config.js",
        content: "const stripeApiKey = 'sk_live_99887766554433221100';",
        deleted: false
      }
    ]
  };

  const mockLLMResponse = `{
    "verdict": "FAIL",
    "applicability": "APPLICABLE",
    "confidence": 1.0,
    "summary": "Hardcoded Stripe secret key found in source code",
    "findings": [
      {
        "criterionId": "SECRET-C1",
        "vulnerabilityClass": "SECRET_EXPOSURE",
        "primaryLocation": { "file": "config.js", "line": 1 },
        "title": "Hardcoded Stripe API Key",
        "severity": "critical",
        "description": "A live Stripe API key is hardcoded in config.js.",
        "suggestion": "Move Stripe API key to environment variables.",
        "evidence": [
          { "file": "config.js", "line": 1, "snippet": "const stripeApiKey = 'sk_live_99887766554433221100';", "explanation": "Live API key assignment" }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(apiKeyContext, "framework", mockSpec);
  
  assertEquals(result.verdict, "FAIL", "Hardcoded API key must result in FAIL");
  assertEquals(result.findings.length, 1);
  assertEquals(result.findings[0].vulnerabilityClass, "SECRET_EXPOSURE");
});

Deno.test("CheckpointRunner - Regression Test: API returning password_hash/ssn -> should NOT be SECRET_EXPOSURE", async () => {
  const piiContext = {
    ...mockContext,
    changedFiles: [
      {
        path: "routes/user.js",
        content: "app.get('/api/user/:id', async (req, res) => { const user = await db.query('SELECT ssn, password_hash, email FROM users WHERE id = $1', [req.params.id]); res.json(user); });",
        deleted: false
      }
    ]
  };

  const mockLLMResponse = `{
    "verdict": "FAIL",
    "applicability": "APPLICABLE",
    "confidence": 0.8,
    "summary": "API queries and returns user record with ssn and password_hash",
    "findings": [
      {
        "criterionId": "SECRET-C3",
        "vulnerabilityClass": "SECRET_EXPOSURE",
        "primaryLocation": { "file": "routes/user.js", "line": 1 },
        "title": "Secret Exposure in User Endpoint",
        "severity": "critical",
        "description": "Endpoint returns ssn and password_hash to caller.",
        "suggestion": "Omit ssn and password_hash from response payload.",
        "evidence": [
          { "file": "routes/user.js", "line": 1, "snippet": "const user = await db.query('SELECT ssn, password_hash, email FROM users WHERE id = $1', [req.params.id]); res.json(user);", "explanation": "DB query and response" }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(piiContext, "framework", mockSpec);
  
  // Guardrail should suppress this finding from being classified as SECRET_EXPOSURE
  assertEquals(result.verdict, "NOT_VERIFIED", "Returning ssn/password_hash in business query is not SECRET_EXPOSURE and should be suppressed");
  assertEquals(result.findings.length, 0, "Non-secret database query findings must not produce SECRET_EXPOSURE");
});

Deno.test("CheckpointRunner - Regression Test: Clean code -> no finding", async () => {
  const cleanContext = {
    ...mockContext,
    changedFiles: [
      {
        path: "math.js",
        content: "export function add(a, b) { return a + b; }",
        deleted: false
      }
    ]
  };

  const mockLLMResponse = `{
    "verdict": "PASS",
    "applicability": "APPLICABLE",
    "confidence": 1.0,
    "summary": "No security vulnerabilities detected in pure mathematical utility functions.",
    "findings": []
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(cleanContext, "framework", mockSpec);
  
  assertEquals(result.verdict, "PASS", "Clean code should return PASS verdict");
  assertEquals(result.findings.length, 0, "Clean code should produce 0 findings");
});

Deno.test("CheckpointRunner - Regression Test: AUTH_BYPASS location points to token creation decision instead of getUserByUsername", async () => {
  const authBypassContext = {
    ...mockContext,
    changedFiles: [
      {
        path: "controllers/auth.js",
        content: [
          "const username = req.body.username;",
          "const user = await getUserByUsername(username);",
          "const token = createSessionToken(user.id);",
          "res.json({ token });"
        ].join("\n"),
        deleted: false
      }
    ]
  };

  // Mock LLM mistakenly returning line 2 (getUserByUsername) instead of line 3 (createSessionToken)
  const mockLLMResponse = `{
    "verdict": "FAIL",
    "applicability": "APPLICABLE",
    "confidence": 0.95,
    "summary": "User authentication bypassed: session token generated without password validation",
    "findings": [
      {
        "criterionId": "AUTH-C4",
        "vulnerabilityClass": "AUTH_BYPASS",
        "primaryLocation": { "file": "controllers/auth.js", "line": 2 },
        "title": "Authentication Bypass in Login Flow",
        "severity": "critical",
        "description": "Session token is issued after querying user by username without verifying password.",
        "suggestion": "Verify user credentials before issuing session token.",
        "evidence": [
          {
            "file": "controllers/auth.js",
            "line": 2,
            "snippet": "const user = await getUserByUsername(username);",
            "explanation": "User looked up by username"
          }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(authBypassContext, "framework", mockSpec);

  // Must preserve AUTH_BYPASS detection (FAIL verdict)
  assertEquals(result.verdict, "FAIL", "Legitimate AUTH_BYPASS must not be suppressed");
  assertEquals(result.findings.length, 1, "Must have exactly 1 AUTH_BYPASS finding");
  assertEquals(result.findings[0].vulnerabilityClass, "AUTH_BYPASS");
  
  // Must refine location to the actual token creation decision (line 3) instead of query line (line 2)
  assertEquals(result.findings[0].primaryLocation.line, 3, "Finding location must point to createSessionToken line (line 3)");
  assertEquals(result.findings[0].evidence[0].line, 3, "Primary evidence line must point to line 3");
  assertEquals(result.findings[0].evidence[0].snippet, "const token = createSessionToken(user.id);");
});

Deno.test("CheckpointRunner - Regression Test: SSRF location points to outbound request sink instead of req.query extraction", async () => {
  const ssrfContext = {
    ...mockContext,
    changedFiles: [
      {
        path: "controllers/proxy.js",
        content: [
          "const url = req.query.url;",
          "const response = await axios.get(url);",
          "res.json(response.data);"
        ].join("\n"),
        deleted: false
      }
    ]
  };

  // Mock LLM mistakenly returning line 1 (const url = req.query.url;) instead of line 2 (axios.get)
  const mockLLMResponse = `{
    "verdict": "FAIL",
    "applicability": "APPLICABLE",
    "confidence": 0.95,
    "summary": "Server-Side Request Forgery (SSRF): untrusted user URL fetched directly with axios",
    "findings": [
      {
        "criterionId": "INPUT-C2",
        "vulnerabilityClass": "SSRF",
        "primaryLocation": { "file": "controllers/proxy.js", "line": 1 },
        "title": "Server-Side Request Forgery (SSRF)",
        "severity": "critical",
        "description": "User-supplied query parameter url is passed to an outbound HTTP request without validation or allowlisting.",
        "suggestion": "Validate and allowlist URLs before making outbound HTTP requests.",
        "evidence": [
          {
            "file": "controllers/proxy.js",
            "line": 1,
            "snippet": "const url = req.query.url;",
            "explanation": "URL parameter extracted from user query"
          }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(ssrfContext, "framework", mockSpec);

  // Must preserve SSRF detection (FAIL verdict)
  assertEquals(result.verdict, "FAIL", "Legitimate SSRF must not be suppressed");
  assertEquals(result.findings.length, 1, "Must have exactly 1 SSRF finding");
  assertEquals(result.findings[0].vulnerabilityClass, "SSRF");

  // Must refine location to the actual outbound request sink (line 2) instead of extraction line (line 1)
  assertEquals(result.findings[0].primaryLocation.line, 2, "Finding location must point to axios.get sink line (line 2)");
  assertEquals(result.findings[0].evidence[0].line, 2, "Primary evidence line must point to line 2");
  assertEquals(result.findings[0].evidence[0].snippet, "const response = await axios.get(url);");
});

Deno.test("CheckpointRunner - Regression Test: CORS configuration with model disclaimer is preserved", async () => {
  const corsContext = {
    ...mockContext,
    changedFiles: [
      {
        path: "server.js",
        content: [
          'res.setHeader("Access-Control-Allow-Origin", "*");',
          'res.setHeader("Access-Control-Allow-Credentials", "true");'
        ].join("\n"),
        deleted: false
      }
    ]
  };

  const mockLLMResponse = `{
    "verdict": "FAIL",
    "applicability": "APPLICABLE",
    "confidence": 0.95,
    "summary": "Insecure CORS configuration: Access-Control-Allow-Origin is set to wildcard while Access-Control-Allow-Credentials is true.",
    "findings": [
      {
        "criterionId": "CONFIG-C2",
        "vulnerabilityClass": "INSECURE_CONFIGURATION",
        "primaryLocation": { "file": "server.js", "line": 1 },
        "title": "Insecure CORS Configuration: Wildcard Origin with Credentials",
        "severity": "critical",
        "description": "The server sets Access-Control-Allow-Origin to '*' while enabling Access-Control-Allow-Credentials. While full server context is not visible in the provided snippet, this combination violates CORS security constraints.",
        "suggestion": "Specify explicit origins when credentials are allowed.",
        "evidence": [
          {
            "file": "server.js",
            "line": 1,
            "snippet": "res.setHeader(\\"Access-Control-Allow-Origin\\", \\"*\\");\\nres.setHeader(\\"Access-Control-Allow-Credentials\\", \\"true\\");",
            "explanation": "Wildcard origin combined with credentials true. Full server context is not visible in the provided snippet."
          }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(corsContext, "framework", mockSpec);

  // Finding must be preserved despite disclaimer phrases in description/explanation
  assertEquals(result.verdict, "FAIL", "CORS flaw must result in FAIL verdict");
  assertEquals(result.findings.length, 1, "CORS finding must NOT be suppressed by disclaimer phrases");
  assertEquals(result.findings[0].vulnerabilityClass, "INSECURE_CONFIGURATION");
});

Deno.test("CheckpointRunner - Regression Test: Genuinely speculative finding based on missing context is suppressed", async () => {
  const normalContext = {
    ...mockContext,
    changedFiles: [
      {
        path: "routes/data.js",
        content: "app.get('/api/data', (req, res) => res.json({ status: 'ok' }));",
        deleted: false
      }
    ]
  };

  // Speculative LLM finding claiming missing security headers on an ordinary route handler snippet
  const mockLLMResponse = `{
    "verdict": "FAIL",
    "applicability": "APPLICABLE",
    "confidence": 0.5,
    "summary": "Security headers are not shown in this endpoint definition.",
    "findings": [
      {
        "criterionId": "CONFIG-C1",
        "vulnerabilityClass": "INSECURE_CONFIGURATION",
        "primaryLocation": { "file": "routes/data.js", "line": 1 },
        "title": "Missing Security Headers",
        "severity": "warning",
        "description": "Security headers such as Content-Security-Policy and X-Frame-Options are not visible in the provided snippet.",
        "suggestion": "Configure helmet or similar security header middleware.",
        "evidence": [
          {
            "file": "routes/data.js",
            "line": 1,
            "snippet": "app.get('/api/data', (req, res) => res.json({ status: 'ok' }));",
            "explanation": "Security headers are not shown in the snippet."
          }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(normalContext, "framework", mockSpec);

  // Purely speculative finding must be suppressed by Rule 4
  assertEquals(result.verdict, "NOT_VERIFIED", "Speculative finding should result in NOT_VERIFIED verdict");
  assertEquals(result.findings.length, 0, "Speculative finding must be suppressed");
});

Deno.test("CheckpointRunner - Regression Test: Suppress JWT_SECURITY on req.headers.authorization reading by itself", async () => {
  const context = {
    ...mockContext,
    changedFiles: [
      {
        path: "middleware/auth.js",
        content: "const authHeader = req.headers.authorization;\nconst token = authHeader?.split(' ')[1];\nconsole.log(token);",
        deleted: false
      }
    ]
  };

  const mockLLMResponse = `{
    "verdict": "FAIL",
    "applicability": "APPLICABLE",
    "confidence": 0.9,
    "summary": "Header reading flagged.",
    "findings": [
      {
        "criterionId": "SESSION-C2",
        "vulnerabilityClass": "JWT_SECURITY",
        "primaryLocation": { "file": "middleware/auth.js", "line": 1 },
        "title": "Insecure Token Extraction",
        "severity": "warning",
        "description": "Reading req.headers.authorization without verification on extraction line.",
        "suggestion": "Verify token.",
        "evidence": [
          {
            "file": "middleware/auth.js",
            "line": 1,
            "snippet": "const authHeader = req.headers.authorization;",
            "explanation": "Header is read directly."
          }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(context, "framework", mockSpec);

  assertEquals(result.verdict, "NOT_VERIFIED");
  assertEquals(result.findings.length, 0, "Innocent header reading must not be flagged as JWT_SECURITY");
});

Deno.test("CheckpointRunner - Regression Test: Suppress JWT_SECURITY on /admin route declaration by itself", async () => {
  const context = {
    ...mockContext,
    changedFiles: [
      {
        path: "routes/admin.js",
        content: "app.get('/admin', (req, res) => {\n  res.send('admin');\n});",
        deleted: false
      }
    ]
  };

  const mockLLMResponse = `{
    "verdict": "FAIL",
    "applicability": "APPLICABLE",
    "confidence": 0.9,
    "summary": "Admin route without middleware.",
    "findings": [
      {
        "criterionId": "SESSION-C2",
        "vulnerabilityClass": "JWT_SECURITY",
        "primaryLocation": { "file": "routes/admin.js", "line": 1 },
        "title": "Unprotected Admin Route",
        "severity": "critical",
        "description": "Route /admin is declared without authentication middleware.",
        "suggestion": "Add auth middleware.",
        "evidence": [
          {
            "file": "routes/admin.js",
            "line": 1,
            "snippet": "app.get('/admin', (req, res) => {",
            "explanation": "The /admin endpoint is missing auth middleware."
          }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(context, "framework", mockSpec);

  assertEquals(result.verdict, "NOT_VERIFIED");
  assertEquals(result.findings.length, 0, "Route declaration must not be flagged as JWT_SECURITY");
});

Deno.test("CheckpointRunner - Regression Test: Refine JWT_SECURITY location from header extraction to jwt.decode trust sink", async () => {
  const fileContent = [
    "app.get('/profile', (req, res) => {",
    "  const token = req.headers.authorization.split(' ')[1];", // line 2
    "  const decoded = jwt.decode(token);",                     // line 3
    "  req.user = decoded;",                                    // line 4
    "  res.json(req.user);",
    "});"
  ].join("\n");

  const context = {
    ...mockContext,
    changedFiles: [
      {
        path: "routes/profile.js",
        content: fileContent,
        deleted: false
      }
    ]
  };

  const mockLLMResponse = `{
    "verdict": "FAIL",
    "applicability": "APPLICABLE",
    "confidence": 0.9,
    "summary": "Unverified token decode.",
    "findings": [
      {
        "criterionId": "SESSION-C2",
        "vulnerabilityClass": "JWT_SECURITY",
        "cwes": ["CWE-347"],
        "primaryLocation": { "file": "routes/profile.js", "line": 2 },
        "title": "Unverified JWT Decoded",
        "severity": "critical",
        "description": "Token is decoded without signature verification.",
        "suggestion": "Use jwt.verify instead of jwt.decode.",
        "evidence": [
          {
            "file": "routes/profile.js",
            "line": 2,
            "snippet": "const token = req.headers.authorization.split(' ')[1];",
            "explanation": "Extracts authorization header"
          }
        ]
      }
    ]
  }`;

  const runner = new CheckpointRunner(new MockProvider(mockLLMResponse));
  const result = await runner.run(context, "framework", mockSpec);

  assertEquals(result.verdict, "FAIL");
  assertEquals(result.findings.length, 1);
  assertEquals(result.findings[0].primaryLocation.line, 3, "Primary location must be refined to jwt.decode line");
  assertEquals(result.findings[0].evidence[0].line, 3);
  assertEquals(result.findings[0].evidence[0].snippet, "const decoded = jwt.decode(token);");
});






;(async () => {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('✅ ' + t.name);
      passed++;
    } catch (e) {
      console.error('❌ ' + t.name);
      console.error(e.message);
      failed++;
    }
  }
  console.log(`Results: ${passed} passed, ${failed} failed`);
})();
