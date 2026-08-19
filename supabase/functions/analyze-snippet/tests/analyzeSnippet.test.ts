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
