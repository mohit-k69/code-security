import { localCodeVibeTask } from "./braintrust_eval_local.ts";

async function run() {
  console.log("Checking env vars inside Deno process:");
  console.log("OPENROUTER_API_KEY present:", !!Deno.env.get('OPENROUTER_API_KEY'));
  console.log("STANDARD_MODEL:", Deno.env.get('STANDARD_MODEL'));
  console.log("MAJOR_MODEL:", Deno.env.get('MAJOR_MODEL'));

  const data = JSON.parse(await Deno.readTextFile("./eval_braintrust_30_cases.json"));
  const tc_001 = data.find((tc: any) => tc.id === 'tc_001');

  if (!tc_001) {
    console.error("tc_001 not found");
    return;
  }

  console.log("Executing localCodeVibeTask for tc_001...");
  try {
    const result = await localCodeVibeTask(tc_001);
    console.log("Success:", result);
  } catch (error: any) {
    console.error("Task failed with error:");
    console.error(error);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
  }
}

run();
