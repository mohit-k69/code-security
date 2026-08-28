import fs from "fs";
const data = JSON.parse(fs.readFileSync("benchmark_3x_results.json", "utf-8"));
let passes = 0, fails = 0, non = 0;
for (const tc of Object.values(data) as any) {
  if (tc.classification === "STABLE MATCH") passes++;
  else if (tc.classification === "STABLE FAILURE") fails++;
  else non++;
}
console.log(`Stable passes: ${passes}, Stable failures: ${fails}, Nondeterministic: ${non}`);
