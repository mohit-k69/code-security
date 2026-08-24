import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRequest } from "./supabase/functions/analyze-snippet/index.ts";

Deno.test("Fallback models", async () => {
  Deno.env.set('NODE_ENV', 'production');
  Deno.env.set('OPENROUTER_API_KEY', 'test-key');
  Deno.env.delete('STANDARD_MODEL');
  Deno.env.delete('MAJOR_MODEL');
  Deno.env.delete('LLM_MODEL');
  
  const req1 = new Request("http://localhost/", { method: "POST", headers: { "Authorization": "Bearer token", "Content-Type": "application/json" }, body: JSON.stringify({ files: [] }) });
  const res1 = await handleRequest(req1);
  const err1 = await res1.json();
  assertEquals(err1.error, 'Missing LLM_MODEL or STANDARD_MODEL configuration');

  Deno.env.set('LLM_MODEL', 'my-fallback');
  const req2 = new Request("http://localhost/", { method: "POST", headers: { "Authorization": "Bearer token", "Content-Type": "application/json" }, body: JSON.stringify({ files: [] }) });
  const res2 = await handleRequest(req2);
  const data2 = await res2.json();
  // We expect a ProviderError from openrouter because 'test-key' is invalid, BUT we know it got past the configuration check!
  // Wait, if files is empty, it fails open and MIGHT return a PASS report without hitting the LLM!
  // Let's check!
  console.log(data2);
});
