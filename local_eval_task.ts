// Polyfill Deno.env for local Node.js Braintrust execution
if (typeof globalThis.Deno === 'undefined') {
  (globalThis as any).Deno = {
    env: { get: (key: string) => process.env[key] }
  };
}

import { PatternRegistry } from "./supabase/functions/analyze-repository/services/PatternRegistry.ts";
import { SensitiveDataDetector } from "./supabase/functions/analyze-repository/services/SensitiveDataDetector.ts";
import { PlaceholderRegistry } from "./supabase/functions/analyze-repository/services/PlaceholderRegistry.ts";
import { SensitiveDataSanitizer } from "./supabase/functions/analyze-repository/services/SensitiveDataSanitizer.ts";
import { OpenRouterProvider } from "./supabase/functions/analyze-repository/orchestrator/providers/OpenRouterProvider.ts";
import { ReviewOrchestrator } from "./supabase/functions/analyze-repository/orchestrator/ReviewOrchestrator.ts";
import type { ContextPackage } from "./supabase/functions/analyze-repository/services/types.ts";

export async function localCodeVibeTask(input: any) {
  const snippet = typeof input === 'string' ? input : input.snippet;

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

  const getEnv = (key: string) => typeof process !== 'undefined' ? process.env[key] : Deno.env.get(key);
  const standardModel = getEnv('STANDARD_MODEL');
  const majorModel = getEnv('MAJOR_MODEL');
  const apiKey = getEnv('OPENROUTER_API_KEY');

  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable. Cannot run local evaluation.");
  }
  if (!standardModel || !majorModel) {
    throw new Error("Missing STANDARD_MODEL or MAJOR_MODEL environment variable. Both must be explicitly provided. No fallback model is permitted.");
  }

  const rawProvider = new OpenRouterProvider(standardModel);
  let providerError: any = null;
  const llmProvider = {
    name: rawProvider.name,
    generateContent: async (systemPrompt: string, userPrompt: string, model?: string) => {
      try {
        return await rawProvider.generateContent(systemPrompt, userPrompt, model);
      } catch (err) {
        providerError = err;
        throw err;
      }
    }
  };

  const orchestrator = new ReviewOrchestrator({ 
    provider: llmProvider as any,
    models: { standard: standardModel, major: majorModel }
  });

  const executionResult = await orchestrator.review(sanitizedPackage);
  if (providerError) {
    throw providerError;
  }
  return executionResult.report;
}
