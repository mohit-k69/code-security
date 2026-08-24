import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { FindingAggregator } from "../FindingAggregator.ts";
import { VulnerabilityClass } from "../../types/VulnerabilityClass.ts";
import type { CheckpointResult, CheckpointFinding } from "../../../services/CheckpointRunner.ts";

function createFinding(
  id: string, 
  vulnClass: string, 
  title: string, 
  desc: string, 
  file: string, 
  line: number, 
  snippet: string,
  cwes: string[] = []
): CheckpointFinding {
  return {
    findingId: `HASH-${id}`,
    criterionId: `CRI-${id}`,
    vulnerabilityClass: vulnClass as VulnerabilityClass,
    primaryLocation: { file, line },
    title,
    severity: "critical",
    description: desc,
    suggestion: "Suggestion",
    cwes,
    evidence: [{ file, line, snippet, explanation: "Expl" }]
  };
}

function wrapFinding(finding: CheckpointFinding): CheckpointResult {
  return {
    checkpointId: `CHK-${finding.criterionId}`,
    checkpointName: `Name`,
    verdict: "FAIL",
    applicability: "APPLICABLE",
    confidence: 1.0,
    summary: "Mock summary",
    findings: [finding],
    status: "completed",
    execution: { executionTimeMs: 100, llmDurationMs: 50, model: "test", timestamp: "" }
  };
}

function createMockResult(findings: CheckpointFinding[]): CheckpointResult {
  return {
    checkpointId: "TEST-1",
    checkpointName: "Test Checkpoint",
    verdict: "FAIL",
    applicability: "APPLICABLE",
    confidence: 1.0,
    summary: "Test summary",
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

Deno.test("FindingAggregator - Test Case 1: SECRET_EXPOSURE and JWT_SECURITY on same line", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "SECRET_EXPOSURE", "Hardcoded Secret", "Hardcoded JWT secret 'my_secret' found.", 
    "auth.ts", 9, "const JWT_SECRET = 'my_secret';"
  );
  const f2 = createFinding(
    "2", "JWT_SECURITY", "Missing Expiration", "JWT is missing an expiration time.", 
    "auth.ts", 9, "const JWT_SECRET = 'my_secret';"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 2, "Should NOT merge SECRET_EXPOSURE and JWT_SECURITY on the same line");
});

Deno.test("FindingAggregator - Test Case 2: Different Secrets on Nearby Lines", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "SECRET_EXPOSURE", "Database Password", "Database password 'supersecret' is hardcoded.", 
    "auth.ts", 7, "const DB_PASS = 'supersecret';"
  );
  const f2 = createFinding(
    "2", "JWT_SECURITY", "JWT Secret", "JWT secret 'my_hardcoded_jwt_secret' is hardcoded.", 
    "auth.ts", 9, "const JWT_SECRET = 'my_hardcoded_jwt_secret';"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 2, "Should NOT merge distinct secrets on nearby lines");
});

Deno.test("FindingAggregator - Test Case 3: Hardcoded secret vs AUTH_BYPASS", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "SECRET_EXPOSURE", "Hardcoded Database Password", "Database password is hardcoded directly in the source code.", 
    "auth.ts", 12, "if (username === 'admin' && password === 'supersecret')"
  );
  const f2 = createFinding(
    "2", "AUTH_BYPASS", "Authentication Bypass", "Authentication logic directly compares provided username against hardcoded values. Bypasses proper user management.", 
    "auth.ts", 12, "if (username === 'admin' && password === 'supersecret')"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 2, "Should NOT merge hardcoded secret and auth bypass despite same line and snippet");
});

Deno.test("FindingAggregator - Test Case 4: Hardcoded JWT secret vs missing expiration", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "JWT_SECURITY", "Hardcoded JWT Secret", "The JWT secret is hardcoded directly into the source code.", 
    "auth.ts", 16, "const token = jwt.sign({ user: username }, JWT_SECRET);"
  );
  const f2 = createFinding(
    "2", "JWT_SECURITY", "Missing JWT Expiration", "The JWT is created without an expiration time, meaning it will never expire.", 
    "auth.ts", 16, "const token = jwt.sign({ user: username }, JWT_SECRET);"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 2, "Should NOT merge hardcoded secret and missing expiration");
});

Deno.test("FindingAggregator - Test Case 5: Identical Vulnerability Spanning Slightly Different Lines (LLM Jitter)", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "INPUT_VALIDATION", "Missing Validation", "Missing validation on user email before SQL execution.", 
    "db.ts", 15, "const query = 'SELECT * FROM users WHERE email = ' + req.body.email;"
  );
  const f2 = createFinding(
    "2", "SQL_INJECTION", "SQL Injection", "User email input is concatenated directly into SQL query without parameterization.", 
    "db.ts", 16, "const query = 'SELECT * FROM users WHERE email = ' + req.body.email;" // Jitter in line
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 1, "Should merge jittered lines reporting the same issue");
});

Deno.test("FindingAggregator - Test Case 6: Same Vulnerability Class, Completely Different Sinks", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "INPUT_VALIDATION", "Missing Validation", "Missing validation on 'ip' before exec().", 
    "app.ts", 25, "exec(ip);"
  );
  const f2 = createFinding(
    "2", "INPUT_VALIDATION", "Missing Validation", "Missing validation on 'hostname' before exec().", 
    "app.ts", 50, "exec(hostname);"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 2, "Should NOT merge distant lines even with same class and similar description");
});

Deno.test("FindingAggregator - Test Case 7: Same SQL_INJECTION class + same line + different descriptions", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "SQL_INJECTION", "Missing Input Validation", "Input is not validated/sanitized.", 
    "snippet.js", 10, "db.query(req.body.id);"
  );
  const f2 = createFinding(
    "2", "SQL_INJECTION", "Missing Output Escaping", "Input is not escaped before SQL interpolation.", 
    "snippet.js", 10, "db.query(req.body.id);"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 1, "Should merge identical vulnerability class on same line despite different descriptions");
});

Deno.test("FindingAggregator - Test Case 8: Same SQL_INJECTION class + nearby lines + different evidence", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "SQL_INJECTION", "Missing Input Validation", "Input is not validated.", 
    "snippet.js", 10, "const id = req.body.id;"
  );
  const f2 = createFinding(
    "2", "SQL_INJECTION", "Missing Output Escaping", "Input is not escaped.", 
    "snippet.js", 11, "db.query(`SELECT * FROM users WHERE id = ${id}`);"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 1, "Should merge identical vulnerability class on nearby lines with different evidence");
});

Deno.test("FindingAggregator - Test Case 9: SQL_INJECTION vs SECRET_EXPOSURE on same line", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "SQL_INJECTION", "SQL Injection", "Unescaped input in query.", 
    "snippet.js", 10, "db.query(`SELECT * FROM users WHERE pass = '${'secret'}'`);"
  );
  const f2 = createFinding(
    "2", "SECRET_EXPOSURE", "Hardcoded Secret", "Hardcoded database password.", 
    "snippet.js", 10, "db.query(`SELECT * FROM users WHERE pass = '${'secret'}'`);"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 2, "Should NOT merge different vulnerability classes on same line");
});

Deno.test("FindingAggregator - Test Case 10: SECRET_EXPOSURE distinct secrets on nearby lines (Realistic LLM Text)", () => {
  const aggregator = new FindingAggregator();
  
  // Real LLM text has high semantic overlap
  const f1 = createFinding(
    "1", "SECRET_EXPOSURE", "Hardcoded Database Credentials", "The database password is hardcoded directly in the source code. This exposes the credential to anyone with access to the repository.", 
    "snippet.js", 10, "const DB_PASS = 'db_secret';"
  );
  const f2 = createFinding(
    "2", "SECRET_EXPOSURE", "Hardcoded JWT Secret", "The JWT secret is defined as a string literal in the source code. This exposes the credential to anyone with access to the repository.", 
    "snippet.js", 11, "const JWT_SECRET = 'jwt_secret';"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 2, "Should NOT merge distinct secrets on nearby lines even if text is highly similar");
});

Deno.test("FindingAggregator - Test Case 11: SECRET_EXPOSURE distinct secrets far apart", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "SECRET_EXPOSURE", "Hardcoded Database Credentials", "The database password is hardcoded directly in the source code.", 
    "snippet.js", 10, "const DB_PASS = 'db_secret';"
  );
  const f2 = createFinding(
    "2", "SECRET_EXPOSURE", "Hardcoded API Key", "The API key is defined as a string literal in the source code.", 
    "snippet.js", 100, "const API_KEY = 'api_key';"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 2, "Should NOT merge distinct secrets far apart");
});

Deno.test("FindingAggregator - Test Case 12: SECRET_EXPOSURE exact duplicate secret finding", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "SECRET_EXPOSURE", "Secret Exposed", "A secret is in the code.", 
    "snippet.js", 10, "const DB_PASS = 'db_secret';"
  );
  // f2 is an exact duplicate (same findingId)
  const f2 = { ...f1 };

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 1, "Should merge exact duplicate secret finding");
});

Deno.test("FindingAggregator - Test Case 13: SECRET_EXPOSURE same secret reported by multiple checkpoints", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "SECRET_EXPOSURE", "Secret Exposed (Tool A)", "A secret is in the code.", 
    "snippet.js", 10, "const DB_PASS = 'db_secret';"
  );
  const f2 = createFinding(
    "2", "SECRET_EXPOSURE", "Hardcoded Secret (Tool B)", "A password is in the code.", 
    "snippet.js", 10, "const DB_PASS = 'db_secret';"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 1, "Should merge same secret on the same line reported by multiple checkpoints");
});

Deno.test("Aggregator: Merges identical class with overlapping evidence despite large line distance", () => {
  const aggregator = new FindingAggregator();
  const f1 = createFinding(
    "1", "AUTH_BYPASS", "Auth Bypass", "Authentication bypass via query parameter.", 
    "snippet.js", 61, "const bypassAuth = req.query.bypass === 'true';"
  );
  const f2 = createFinding(
    "2", "AUTH_BYPASS", "Auth Bypass", "Bypass allowed by bypassAuth flag.", 
    "snippet.js", 74, "const bypassAuth = req.query.bypass === 'true';"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 1, "Should merge because evidence snippets overlap strongly despite line distance");
});

Deno.test("Aggregator: Does not merge identical class if far apart and no evidence overlap", () => {
  const aggregator = new FindingAggregator();
  const f1 = createFinding(
    "1", "SQL_INJECTION", "SQL Injection 1", "Unsafe interpolation.", 
    "snippet.js", 20, "db.query(`SELECT * FROM a WHERE id=${id}`)"
  );
  const f2 = createFinding(
    "2", "SQL_INJECTION", "SQL Injection 2", "Unsafe concatenation.", 
    "snippet.js", 80, "db.execute('DELETE FROM b WHERE x=' + x)"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 2, "Should NOT merge because they are far apart and evidence differs");
});

Deno.test("Aggregator: Does not merge different classes far apart even with same evidence (preserves existing behavior)", () => {
  const aggregator = new FindingAggregator();
  const f1 = createFinding(
    "1", "SECRET_EXPOSURE", "Exposed Secret", "A secret is exposed.", 
    "snippet.js", 20, "const secret = 'super_secret';"
  );
  const f2 = createFinding(
    "2", "JWT_SECURITY", "Weak JWT", "JWT uses weak signing key.", 
    "snippet.js", 80, "const secret = 'super_secret';"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  // similarity between text1 and text2 will be calculated.
  // text1: "SECRET_EXPOSURE Exposed Secret A secret is exposed."
  // text2: "JWT_SECURITY Weak JWT JWT uses weak signing key."
  // Overlap is minimal, similarity < 0.15, so they remain separate.
  assertEquals(aggregated.length, 2, "Different classes should remain separate even if evidence overlaps, if text similarity is low");
});

Deno.test("FindingAggregator - Test Case 14: Duplicate JWT_SECURITY merging", () => {
  const aggregator = new FindingAggregator();
  
  const f1 = createFinding(
    "1", "JWT_SECURITY", "Missing Expiration", "The JWT lacks an expiration time.", 
    "auth.ts", 9, "jwt.sign(payload, secret);"
  );
  const f2 = createFinding(
    "2", "JWT_SECURITY", "Missing Expiration Time", "The JWT does not have an expiration time set.", 
    "auth.ts", 9, "jwt.sign(payload, secret);"
  );

  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 1, "Should merge duplicate JWT_SECURITY findings describing the same issue");
});

Deno.test("FindingAggregator - tc_030 regression: SECRET_EXPOSURE and JWT_SECURITY (hardcoded key) merge if describing same secret", () => {
  const aggregator = new FindingAggregator();
  const f1 = createFinding(
    "1", "SECRET_EXPOSURE", "Hardcoded Secret", "The JWT signing secret is hardcoded directly in the source code.", 
    "snippet.js", 5, "const token = jwt.sign({ user }, 'super_secret_jwt_key');", ["CWE-798"]
  );
  const f2 = createFinding(
    "2", "JWT_SECURITY", "JWT Hardcoded Key", "JWTs are signed using the hardcoded value 'super_secret_jwt_key'.", 
    "snippet.js", 5, "const token = jwt.sign({ user }, 'super_secret_jwt_key');", ["CWE-321", "CWE-798"]
  );
  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 1, "Should merge since they describe the exact same hardcoded key and share high similarity and CWEs");
});

Deno.test("FindingAggregator - tc_013 regression: SECRET_EXPOSURE and JWT_SECURITY (missing expiration) do NOT merge", () => {
  const aggregator = new FindingAggregator();
  const f1 = createFinding(
    "1", "SECRET_EXPOSURE", "Hardcoded Secret", "The JWT signing secret is hardcoded directly in the source code.", 
    "snippet.js", 5, "const token = jwt.sign({ user }, 'super_secret_jwt_key');", ["CWE-798"]
  );
  const f2 = createFinding(
    "2", "JWT_SECURITY", "Missing Expiration", "The JWT signing call does not specify an expiresIn value.", 
    "snippet.js", 5, "const token = jwt.sign({ user }, 'super_secret_jwt_key');", ["CWE-613"]
  );
  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 2, "Should NOT merge because text similarity is low and CWEs differ");
});

Deno.test("FindingAggregator - tc_028 regression: different-line secrets do NOT merge", () => {
  const aggregator = new FindingAggregator();
  const f1 = createFinding(
    "1", "SECRET_EXPOSURE", "Hardcoded API Key", "API key is hardcoded.", 
    "snippet.js", 10, "const key = 'api_key_123';", ["CWE-798"]
  );
  const f2 = createFinding(
    "2", "SECRET_EXPOSURE", "Hardcoded DB Pass", "Database password is hardcoded.", 
    "snippet.js", 12, "const pass = 'db_pass_456';", ["CWE-798"]
  );
  const aggregated = aggregator.aggregate([wrapFinding(f1), wrapFinding(f2)]);
  assertEquals(aggregated.length, 2, "Should NOT merge distinct secrets on different lines");
});
