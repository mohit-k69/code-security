import { codeVibeTask } from "./run_local_eval.ts";

const snippet = `const crypto = require('crypto');
function generateETag(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}`;

async function run() {
  const output = await codeVibeTask(snippet);
  console.log(JSON.stringify(output.findings, null, 2));
}

run();
