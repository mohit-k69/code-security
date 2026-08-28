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
  let passed = 0;
  let failed = 0;
  
  for (const tc of data) {
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
    const sanitizedPackage = sanitizer.sanitize(detector.detect(contextPackage));

    const standardModel = process.env.STANDARD_MODEL as string;
    const majorModel = process.env.MAJOR_MODEL as string;
    
    const orchestrator = new ReviewOrchestrator({ 
      provider: new OpenRouterProvider(standardModel),
      models: { standard: standardModel, major: majorModel }
    });

    const executionResult = await orchestrator.review(sanitizedPackage);
    
    const exp = tc.expected || {};
    const expVerdict = exp.verdict || "UNKNOWN";
    const expClasses = exp.vulnerabilityClasses || [];
    const expSeverities = exp.severities || [];
    const expCount = exp.findingCount !== undefined ? exp.findingCount : -1;
    
    const actVerdict = executionResult.report.verdict;
    const actCount = executionResult.report.totalFindings;
    const actClasses: string[] = [];
    const actSeverities: string[] = [];
    
    if (executionResult.report.findings) {
      Object.keys(executionResult.report.findings).forEach(sev => {
         const list = (executionResult.report.findings as any)[sev];
         if (list && Array.isArray(list)) {
           list.forEach(f => {
              actClasses.push(f.vulnerabilityClass);
              actSeverities.push(f.severity);
           });
         }
      });
    }

    const matchVerdict = expVerdict === actVerdict;
    const matchCount = expCount === actCount;
    const matchClasses = expClasses.every((c: string) => actClasses.includes(c)) && actClasses.every(c => expClasses.includes(c));
    const matchSeverities = expSeverities.every((s: string) => actSeverities.includes(s)) && actSeverities.every(s => expSeverities.includes(s));
    
    if (matchVerdict && matchCount && matchClasses && matchSeverities) {
       console.log(`[PASS] ${caseId}`);
       passed++;
    } else {
       console.log(`[FAIL] ${caseId}`);
       console.log(`       EXPECTED: Verdict=${expVerdict} Count=${expCount} Classes=${expClasses.join(',')} Severities=${expSeverities.join(',')}`);
       console.log(`       ACTUAL:   Verdict=${actVerdict} Count=${actCount} Classes=${actClasses.join(',')} Severities=${actSeverities.join(',')}`);
       failed++;
    }
  }
  
  console.log(`\n============================`);
  console.log(`TOTAL PASSED: ${passed}`);
  console.log(`TOTAL FAILED: ${failed}`);
  console.log(`ACCURACY: ${((passed / data.length) * 100).toFixed(2)}%`);
  console.log(`============================`);
}

runCases().catch(console.error);
