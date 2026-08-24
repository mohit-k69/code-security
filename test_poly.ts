if (typeof globalThis.Deno === 'undefined') {
  console.log("Setting Deno polyfill");
  (globalThis as any).Deno = { env: { get: () => "dummy" } };
} else {
  console.log("Deno already exists");
}
import { OpenRouterProvider } from "./supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";
async function run() {
  const provider = new OpenRouterProvider("openai/gpt-5.6-luna");
  try {
    await provider.generateContent("a", "b");
  } catch (e: any) {
    console.error("Caught:", e.message);
  }
}
run();
