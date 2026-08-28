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

async function runCases() {
  const data = JSON.parse(fs.readFileSync('./eval_braintrust_30_cases.json', 'utf-8'));
  const tc = data.find((c: any) => c.id === 'tc_030');
  
  if (!tc) {
    console.log("tc_030 not found");
    return;
  }
  
  const caseId = tc.id;
  
  const contextPackage: ContextPackage = {
    repository: `local_user/paste_snippet`,
    prNumber: 0,
    commitSha: 'local',
    changedFiles: [{ path: "snippet.js", content: tc.snippet, deleted: false }],
    dependencies: [],
    missingDependencies: [],
    metadata: { totalFiles: 1, totalChars: tc.snippet.length, truncated: false }
  };

  const patternRegistry = new PatternRegistry();
  const detector = new SensitiveDataDetector(patternRegistry);
  const sanitizer = new SensitiveDataSanitizer(new PlaceholderRegistry());
  const detectedPackage = detector.detect(contextPackage);
  const sanitizedPackage = sanitizer.sanitize(detectedPackage);

  const standardModel = process.env.STANDARD_MODEL as string;
  const majorModel = process.env.MAJOR_MODEL as string;
  
  const provider = new OpenRouterProvider(standardModel);
  const orchestrator = new ReviewOrchestrator({ 
    provider,
    models: { standard: standardModel, major: majorModel }
  });

  const executionResult = await orchestrator.review(sanitizedPackage);
  
  const actCount = executionResult.report.totalFindings;
  
  console.log(`\n=== RESULTS FOR ${caseId} ===`);
  console.log(`EXPECTED: Count=${tc.expected.findingCount}`);
  console.log(`ACTUAL:   Count=${actCount}`);
  console.log(JSON.stringify(executionResult, null, 2));
}

runCases().catch(console.error);
