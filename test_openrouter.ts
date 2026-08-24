import { OpenRouterProvider } from "./supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";

async function run() {
  const provider = new OpenRouterProvider("openai/gpt-5.6-luna");
  try {
    const response = await provider.generateContent("You are a bot.", "Hello");
    console.log("Success:", response);
  } catch (error: any) {
    console.error("OpenRouterProvider threw an error:");
    console.error(error);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
  }
}
run();
