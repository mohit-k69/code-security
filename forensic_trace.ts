if (typeof globalThis.Deno === 'undefined') {
  (globalThis as any).Deno = {
    env: { get: (key: string) => process.env[key] }
  };
}

import fs from 'fs';
import { PatternRegistry } from "./supabase/functions/analyze-repository/services/PatternRegistry.ts";
import { SensitiveDataDetector } from "./supabase/functions/analyze-repository/services/SensitiveDataDetector.ts";
import { PlaceholderRegistry } from "./supabase/functions/analyze-repository/services/PlaceholderRegistry.ts";
import { SensitiveDataSanitizer } from "./supabase/functions/analyze-repository/services/SensitiveDataSanitizer.ts";
import { OpenRouterProvider } from "./supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";
import { ReviewOrchestrator } from "./supabase/functions/analyze-repository/orchestrator/ReviewOrchestrator.ts";
import type { ContextPackage } from "./supabase/functions/analyze-repository/services/types.ts";

async function runTrace() {
  const data = JSON.parse(fs.readFileSync('./eval_braintrust_100_cases.json', 'utf-8'));
  const tc044 = data.find((tc: any) => tc.id === 'tc_044');
  
  if (!tc044) {
    console.error("tc_044 not found!");
    return;
  }
  
  const snippet = tc044.snippet;

  const contextPackage: ContextPackage = {
    repository: `local_user/paste_snippet`,
    prNumber: 0,
    commitSha: 'local',
    changedFiles: [{ path: "snippet.js", content: snippet, deleted: false }],
    dependencies: [],
    missingDependencies: [],
    metadata: {
      totalFiles: 1,
      totalChars: snippet.length,
      truncated: false
    }
  };

  const patternRegistry = new PatternRegistry();
  const detector = new SensitiveDataDetector(patternRegistry);
  const detectionResult = detector.detect(contextPackage);

  const placeholderRegistry = new PlaceholderRegistry();
  const sanitizer = new SensitiveDataSanitizer(placeholderRegistry);
  const sanitizedPackage = sanitizer.sanitize(detectionResult);

  const standardModel = process.env.STANDARD_MODEL;
  const majorModel = process.env.MAJOR_MODEL;
  
  const rawProvider = new OpenRouterProvider(standardModel as string);
  const llmProvider = {
    name: rawProvider.name,
    generateContent: async (systemPrompt: string, userPrompt: string, model?: string) => {
      if (userPrompt.includes('SEC-AUTH-001')) {
        console.log("==========================================");
        console.log("PROMPT FOR SEC-AUTH-001:");
        console.log("------------------------------------------");
        console.log(systemPrompt + "\n\n" + userPrompt);
        console.log("==========================================");
      }
      
      const response = await rawProvider.generateContent(systemPrompt, userPrompt, model);
      
      if (userPrompt.includes('SEC-AUTH-001')) {
        console.log("RAW LLM RESPONSE FOR SEC-AUTH-001:");
        console.log("------------------------------------------");
        console.log(response.text);
        console.log("==========================================");
      }
      return response;
    }
  };

  const orchestrator = new ReviewOrchestrator({ 
    provider: llmProvider as any,
    models: { standard: standardModel as string, major: majorModel as string }
  });

  const executionResult = await orchestrator.review(sanitizedPackage);
  
  console.log("CHECKPOINTS SELECTED BY ROUTER:");
  console.log("------------------------------------------");
  console.log(executionResult.report.checkpoints.map(c => c.checkpointId).join(', '));
  console.log("==========================================");
  
  const authResult = executionResult.report.checkpoints.find(c => c.checkpointId === 'SEC-AUTH-001');
  console.log("PARSED CHECKPOINT RUNNER RESULT (SEC-AUTH-001):");
  console.log("------------------------------------------");
  console.log(JSON.stringify(authResult, null, 2));
  console.log("==========================================");
  
  console.log("FINAL AGGREGATED RESULT:");
  console.log("------------------------------------------");
  console.log(JSON.stringify({
    verdict: executionResult.report.verdict,
    findingCount: executionResult.report.totalFindings,
  }, null, 2));
  console.log("==========================================");
}

runTrace().catch(console.error);
