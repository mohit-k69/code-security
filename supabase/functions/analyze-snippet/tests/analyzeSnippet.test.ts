import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRequest } from "../index.ts";

Deno.test("analyze-snippet - Empty input returns NOT_VERIFIED", async () => {
  Deno.env.set('NODE_ENV', 'test');
  
  const req = new Request("http://localhost/analyze-snippet", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ files: [] })
  });

  const res = await handleRequest(req);
  assertEquals(res.status, 200);
  
  const body = await res.json();
  assertEquals(body.report.verdict, "NOT_VERIFIED");
  assertEquals(body.report.repository.name, "paste_snippet");
});

Deno.test("analyze-snippet - Unsupported file type returns NOT_VERIFIED", async () => {
  Deno.env.set('NODE_ENV', 'test');
  
  const req = new Request("http://localhost/analyze-snippet", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      files: [{ name: "secret.key", content: "some secret" }]
    })
  });

  const res = await handleRequest(req);
  assertEquals(res.status, 200);
  
  const body = await res.json();
  assertEquals(body.report.verdict, "NOT_VERIFIED");
});

Deno.test("analyze-snippet - Valid source code without secrets returns PASS", async () => {
  Deno.env.set('NODE_ENV', 'test');
  
  const req = new Request("http://localhost/analyze-snippet", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      files: [{ name: "app.ts", content: "console.log('hello');" }]
    })
  });

  const res = await handleRequest(req);
  assertEquals(res.status, 200);
  
  const body = await res.json();
  assertEquals(body.report.verdict, "PASS");
});

Deno.test("analyze-snippet - Secret-containing input returns FAIL (Sanitizer integration)", async () => {
  Deno.env.set('NODE_ENV', 'test');
  
  const req = new Request("http://localhost/analyze-snippet", {
    method: "POST",
    headers: {
      "Authorization": "Bearer test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      files: [{ name: "auth.ts", content: "const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';" }]
    })
  });

  const res = await handleRequest(req);
  assertEquals(res.status, 200);
  
  const body = await res.json();
  // Since we mocked the LLM provider to check totalSecretsReplaced for FAIL condition
  assertEquals(body.report.verdict, "FAIL");
});

Deno.test("analyze-snippet - Missing STANDARD_MODEL falls back to LLM_MODEL", async () => {
  Deno.env.set('NODE_ENV', 'test');
  Deno.env.set('OPENROUTER_API_KEY', 'test-key');
  Deno.env.delete('STANDARD_MODEL');
  Deno.env.delete('MAJOR_MODEL');
  Deno.env.delete('LLM_MODEL');
  
  const req1 = new Request("http://localhost/analyze-snippet", {
    method: "POST",
    headers: { "Authorization": "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ name: "test.js", content: "const a = 1;" }] })
  });
  
  const res1 = await handleRequest(req1);
  const err1 = await res1.json();
  assertEquals(res1.status, 500);
  assertEquals(err1.error, 'Missing LLM_MODEL or STANDARD_MODEL configuration');

  Deno.env.set('LLM_MODEL', 'fallback-llm-model');
  const req2 = new Request("http://localhost/analyze-snippet", {
    method: "POST",
    headers: { "Authorization": "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ files: [{ name: "test.js", content: "const a = 1;" }] })
  });
  
  const res2 = await handleRequest(req2);
  const body2 = await res2.json();
  
  // It should successfully bypass the model configuration check and fall back to LLM_MODEL.
  // Because it uses 'test-key' as OPENROUTER_API_KEY, the OpenRouterProvider would throw an HTTP 500 when it actually tries to fetch models.
  // However, the test.js content doesn't trigger any checkpoints, so no LLM calls are made, and it successfully returns 200 PASS!
  // This proves that we bypassed the model configuration block successfully using the fallback model!
  assertEquals(res2.status, 200);
  assertEquals(body2.report.verdict, "PASS");
  assertEquals(body2.report.coverage.executedCheckpoints, 0);
});

