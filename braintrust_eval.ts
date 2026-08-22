import { Eval } from "braintrust";

export async function codeVibeTask(input: { snippet: string }) {
  const API_URL = "https://riqjsppvihvcyihuhkzg.supabase.co/functions/v1/analyze-snippet";
  
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Using the exact authentication mechanism from live test scripts
      'x-test-bypass': 'true'
    },
    body: JSON.stringify({
      files: [{ name: "snippet.js", content: input.snippet }]
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
  data: "Eval Braintrust 30 Cases Direct",
  task: codeVibeTask,
  scores: [], // Deterministic scorers can be added here
});
