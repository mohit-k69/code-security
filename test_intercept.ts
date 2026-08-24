const originalFetch = globalThis.fetch;
globalThis.fetch = async function(...args: any[]) {
  console.log("=> INTERCEPTED FETCH:", args[0]);
  const res = await originalFetch.apply(this, args as any);
  const cloned = res.clone();
  console.log("<= FETCH RESPONSE:", res.status, await cloned.text());
  return res;
};

import { localCodeVibeTask } from "./braintrust_eval_local.ts";
import fs from "fs";

async function main() {
  const data = JSON.parse(fs.readFileSync("./eval_braintrust_30_cases.json", "utf8"));
  const tc = data.find((t: any) => t.id === 'tc_001');
  console.log("Executing tc_001...");
  await localCodeVibeTask(tc);
  console.log("Done");
}
main();
