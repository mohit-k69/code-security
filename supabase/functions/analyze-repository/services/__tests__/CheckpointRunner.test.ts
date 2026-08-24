import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
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
