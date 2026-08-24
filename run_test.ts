import { handleRequest } from "./supabase/functions/analyze-snippet/index.ts";

Deno.env.set('NODE_ENV', 'test');
Deno.env.set('OPENROUTER_API_KEY', 'test-key');
Deno.env.set('LLM_MODEL', 'fallback-llm-model');

const req = new Request("http://localhost/analyze-snippet", {
  method: "POST",
  headers: { "Authorization": "Bearer test-token", "Content-Type": "application/json" },
  body: JSON.stringify({ files: [{ name: "test.js", content: "const a = 1;" }] })
});

const res = await handleRequest(req);
const body = await res.json();
console.log(res.status, JSON.stringify(body));
