import { localCodeVibeTask as codeVibeTask } from "./local_eval_task.ts";
import { 
  findingCountAccuracy, 
  findingClassAccuracy, 
  severityAccuracy, 
  deduplicationAccuracy, 
  verdictAccuracy 
} from "./braintrust_scorers.ts";

import fs from 'fs';
const filename = process.argv[2] || "./eval_braintrust_100_cases.json";
const data = JSON.parse(fs.readFileSync(filename, 'utf-8'));

let totalScore = 0;
let totalCount = 0;
let scores = {
  verdict: 0,
  findingClass: 0,
  findingCount: 0,
  severity: 0,
  deduplication: 0
};
let timeouts = 0;

const specificResults: Record<string, any> = {};

for (const tc of data) {
  let output;
  try {
    output = await codeVibeTask(tc.snippet);
  } catch (err: any) {
    console.error(`Case ${tc.id} failed:`, err.message);
    timeouts++;
    totalCount++;
    continue;
  }

  const args = { expected: tc.expected, output };
  
  const vScore = verdictAccuracy(args);
  const fcScore = findingClassAccuracy(args);
  const cScore = findingCountAccuracy(args);
  const sScore = severityAccuracy(args);
  const dScore = deduplicationAccuracy(args);
  
  scores.verdict += vScore;
  scores.findingClass += fcScore;
  scores.findingCount += cScore;
  scores.severity += sScore;
  scores.deduplication += dScore;
  
  totalScore += (vScore + fcScore + cScore + sScore + dScore) / 5;
  totalCount++;

  if (['tc_004', 'tc_012', 'tc_013', 'tc_025', 'tc_028', 'tc_030'].includes(tc.id)) {
    specificResults[tc.id] = {
      expectedVerdict: tc.expected.verdict,
      actualVerdict: output.verdict,
      actualClasses: Object.values(output.findings || {}).flat().map((f: any) => f.vulnerabilityClass)
    };
  }
}

// Add a realistic-secret regression test outside the 30 cases just to explicitly verify it
const realisticSecretSnippet = `
const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: 'AKIAIOSFODNN7U4Y3T2Q',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCY1234567890'
});
`;

let realisticSecretResult = null;
try {
  const rsOutput = await codeVibeTask(realisticSecretSnippet);
  realisticSecretResult = {
    actualVerdict: rsOutput.verdict,
    actualClasses: Object.values(rsOutput.findings || {}).flat().map((f: any) => f.vulnerabilityClass)
  };
} catch (e: any) {
  realisticSecretResult = { error: e.message };
}


console.log(JSON.stringify({
  overall: (totalScore / totalCount) * 100,
  metrics: {
    verdict: (scores.verdict / totalCount) * 100,
    findingClass: (scores.findingClass / totalCount) * 100,
    findingCount: (scores.findingCount / totalCount) * 100,
    severity: (scores.severity / totalCount) * 100,
    deduplication: (scores.deduplication / totalCount) * 100,
  },
  timeouts,
  tc_004: specificResults['tc_004'],
  tc_012: specificResults['tc_012'],
  tc_013: specificResults['tc_013'],
  tc_025: specificResults['tc_025'],
  tc_028: specificResults['tc_028'],
  tc_030: specificResults['tc_030'],
  realisticSecret: realisticSecretResult
}, null, 2));
