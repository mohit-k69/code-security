import { 
  findingCountAccuracy, 
  findingClassAccuracy, 
  severityAccuracy, 
  deduplicationAccuracy, 
  verdictAccuracy 
} from "./braintrust_scorers.ts";

import fs from "fs";

const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet";
const EXPERIMENT_NAME = process.argv[2] || "unknown";

interface CaseResult {
  id: string;
  expectedVerdict: string;
  actualVerdict: string;
  expectedClasses: string[];
  actualClasses: string[];
  expectedCount: number;
  actualCount: number;
  verdictScore: number;
  classScore: number;
  countScore: number;
  severityScore: number;
  dedupScore: number;
  caseScore: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

async function codeVibeTask(input: string): Promise<{ report: any; metrics: any }> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-bypass': 'true'
    },
    body: JSON.stringify({
      files: [{ name: "snippet.js", content: input }]
    })
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error: ${res.status} ${res.statusText} - ${errorText}`);
  }
  
  const data = await res.json();
  return { report: data.report, metrics: data.metrics };
}

const data = JSON.parse(await fs.promises.readFile("./eval_braintrust_100_cases.json", "utf8"));

const caseResults: CaseResult[] = [];
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalLatency = 0;
let timeouts = 0;

for (const tc of data) {
  const startMs = performance.now();
  let output: any;
  let metrics: any;
  
  try {
    const result = await codeVibeTask(tc.snippet);
    output = result.report;
    metrics = result.metrics;
  } catch (err: any) {
    console.error(`Case ${tc.id} failed:`, err.message);
    timeouts++;
    caseResults.push({
      id: tc.id,
      expectedVerdict: tc.expected.verdict,
      actualVerdict: "ERROR",
      expectedClasses: tc.expected.vulnerabilityClasses || [],
      actualClasses: [],
      expectedCount: tc.expected.findingCount ?? 0,
      actualCount: 0,
      verdictScore: 0,
      classScore: 0,
      countScore: 0,
      severityScore: 0,
      dedupScore: 0,
      caseScore: 0,
      latencyMs: Math.round(performance.now() - startMs),
      inputTokens: 0,
      outputTokens: 0,
      error: err.message
    });
    continue;
  }

  const latencyMs = Math.round(performance.now() - startMs);
  const inputTokens = metrics?.totalTokenUsage?.promptTokens ?? 0;
  const outputTokens = metrics?.totalTokenUsage?.completionTokens ?? 0;
  totalInputTokens += inputTokens;
  totalOutputTokens += outputTokens;
  totalLatency += latencyMs;

  const args = { expected: tc.expected, output };
  
  const vScore = verdictAccuracy(args);
  const fcScore = findingClassAccuracy(args);
  const cScore = findingCountAccuracy(args);
  const sScore = severityAccuracy(args);
  const dScore = deduplicationAccuracy(args);
  const caseScore = (vScore + fcScore + cScore + sScore + dScore) / 5;

  const actualClasses: string[] = [];
  if (output?.findings) {
    for (const severity of Object.keys(output.findings)) {
      for (const finding of output.findings[severity]) {
        if (finding.vulnerabilityClass) {
          actualClasses.push(finding.vulnerabilityClass);
        }
      }
    }
  }

  caseResults.push({
    id: tc.id,
    expectedVerdict: tc.expected.verdict,
    actualVerdict: output.verdict,
    expectedClasses: tc.expected.vulnerabilityClasses || [],
    actualClasses,
    expectedCount: tc.expected.findingCount ?? 0,
    actualCount: output.totalFindings ?? 0,
    verdictScore: vScore,
    classScore: fcScore,
    countScore: cScore,
    severityScore: sScore,
    dedupScore: dScore,
    caseScore,
    latencyMs,
    inputTokens,
    outputTokens,
  });
}

const n = caseResults.length;
const validResults = caseResults.filter(r => !r.error);

const overall = (validResults.reduce((s, r) => s + r.caseScore, 0) / n) * 100;
const verdictAcc = (validResults.reduce((s, r) => s + r.verdictScore, 0) / n) * 100;
const classAcc = (validResults.reduce((s, r) => s + r.classScore, 0) / n) * 100;
const countAcc = (validResults.reduce((s, r) => s + r.countScore, 0) / n) * 100;
const sevAcc = (validResults.reduce((s, r) => s + r.severityScore, 0) / n) * 100;
const dedupAcc = (validResults.reduce((s, r) => s + r.dedupScore, 0) / n) * 100;
const avgLatency = Math.round(totalLatency / n);

const report = {
  experiment: EXPERIMENT_NAME,
  timestamp: new Date().toISOString(),
  summary: {
    overall: Math.round(overall * 100) / 100,
    verdict: Math.round(verdictAcc * 100) / 100,
    findingClass: Math.round(classAcc * 100) / 100,
    findingCount: Math.round(countAcc * 100) / 100,
    severity: Math.round(sevAcc * 100) / 100,
    deduplication: Math.round(dedupAcc * 100) / 100,
    totalInputTokens,
    totalOutputTokens,
    avgLatencyMs: avgLatency,
    timeouts,
  },
  cases: caseResults,
};

const filename = `experiment_${EXPERIMENT_NAME.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
await fs.promises.writeFile(filename, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
console.error(`\nFull results saved to ${filename}`);
