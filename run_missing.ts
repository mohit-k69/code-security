import { localCodeVibeTask } from "./braintrust_eval_local.ts";
async function main() {
  try {
    await localCodeVibeTask("const foo = 'bar';");
  } catch (e) {
    console.error("Caught error:", e);
  }
}
main();
