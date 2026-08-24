import { codeVibeTask } from "./run_local_eval.ts";

const snippet = `const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
});`;

async function run() {
  const output = await codeVibeTask(snippet);
  console.log(JSON.stringify(output.findings, null, 2));
}

run();
