import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FindingGuardrail } from "../../analyze-repository/services/FindingGuardrail.ts";
import type { CheckpointResult, CheckpointFinding } from "../../analyze-repository/services/CheckpointRunner.ts";

function createMockResult(findings: CheckpointFinding[]): CheckpointResult {
  return {
    checkpointId: "TEST-001",
    checkpointName: "Test Review",
    verdict: "FAIL",
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
  assertEquals(guarded.verdict, "PASS");
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
  assertEquals(guarded.verdict, "PASS");
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
  assertEquals(guarded.verdict, "PASS");
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
  assertEquals(guarded.verdict, "PASS");
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
  assertEquals(guarded.verdict, "PASS");
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
