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
  const data = JSON.parse(fs.readFileSync('./eval_braintrust_100_cases.json', 'utf-8'));
  const casesToRun = ['tc_042', 'tc_093'];
  
  for (const caseId of casesToRun) {
    const tc = data.find((t: any) => t.id === caseId);
    
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
    const sanitizedPackage = sanitizer.sanitize(detector.detect(contextPackage));

    const standardModel = process.env.STANDARD_MODEL as string;
    const majorModel = process.env.MAJOR_MODEL as string;
    
    const provider = new OpenRouterProvider(standardModel);
    const originalGenerate = provider.generateContent.bind(provider);
    provider.generateContent = async (systemPrompt, userPrompt, model, config) => {
        const res = await originalGenerate(systemPrompt, userPrompt, model, config);
        console.log(`\n\n--- LLM RAW RESPONSE for ${caseId} (${model}) ---`);
        console.log(res);
        return res;
    };
    
    const orchestrator = new ReviewOrchestrator({ 
      provider: provider,
      models: { standard: standardModel, major: majorModel }
    });

    const executionResult = await orchestrator.review(sanitizedPackage);
    console.log(`\n--- FINAL AGGREGATED FINDINGS for ${caseId} ---`);
    console.log(JSON.stringify(executionResult.report.findings, null, 2));
  }
}

runCases().catch(console.error);
