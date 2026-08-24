import { Eval, initDataset } from "braintrust";
import { findingCountAccuracy, findingClassAccuracy, severityAccuracy, deduplicationAccuracy, verdictAccuracy } from "./braintrust_scorers.ts";

export async function codeVibeTask(input: any) {
  const snippet = typeof input === 'string' ? input : input.snippet;
  const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet";
  
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Using the exact authentication mechanism from live test scripts
      'x-test-bypass': 'true'
    },
    body: JSON.stringify({
      files: [{ name: "snippet.js", content: snippet }]
    })
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error: ${res.status} ${res.statusText} - ${errorText}`);
  }
  
  const data = await res.json();
  
  // Return the complete report so deterministic scorers can evaluate it.
  // Scorers will receive this output alongside the dataset's 'expected' fields
  // (expected.verdict, expected.vulnerabilityClasses, expected.severities, etc.)
  return data.report;
}

// Braintrust Eval definition linking to the existing remote dataset
Eval("Code Vibe Formal Evaluation", {
  // Uses the existing Braintrust dataset by name rather than hardcoding local cases
  data: (() => initDataset("Code Vibe", { dataset: "Eval Braintrust 30 Cases Direct" })) as any,
  task: codeVibeTask,
  scores: [verdictAccuracy, findingClassAccuracy, findingCountAccuracy, severityAccuracy, deduplicationAccuracy],
  // Limit concurrency to avoid 503 BOOT_ERROR (Worker memory exhaustion) on Supabase Edge Functions
  maxConcurrency: 2,
});
