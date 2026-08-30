import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { GithubService } from "../services/GithubService.ts";
import { PRSelector } from "../services/PRSelector.ts";
import { DependencyResolver } from "../services/DependencyResolver.ts";
import { ContextManager } from "../services/ContextManager.ts";
import { PatternRegistry } from "../services/PatternRegistry.ts";
import { SensitiveDataDetector } from "../services/SensitiveDataDetector.ts";
import { PlaceholderRegistry } from "../services/PlaceholderRegistry.ts";
import { SensitiveDataSanitizer } from "../services/SensitiveDataSanitizer.ts";
import { SanitizationValidator } from "../services/SanitizationValidator.ts";
import { OpenRouterProvider } from "./providers/OpenRouterProvider.ts";
import { ReviewOrchestrator, ReviewExecutionResult } from "./ReviewOrchestrator.ts";

export interface PipelineConfig {
  owner: string;
  repo: string;
  supabaseAdmin: SupabaseClient;
  githubToken: string;
  openRouterKey: string;
  standardModel: string;
  majorModel: string;
}

export type PipelineResult = 
  | { type: 'success'; data: ReviewExecutionResult }
  | { type: 'empty'; data: any; message?: string }
  | { type: 'error'; message: string; status: number };

export class PipelineRunner {
  public async run(config: PipelineConfig): Promise<PipelineResult> {
    const { owner, repo, supabaseAdmin, githubToken, standardModel, majorModel } = config;

    // 1. Instantiate Provider Service
    const providerService = new GithubService(githubToken);

    // 2. Select PR
    const selector = new PRSelector(supabaseAdmin, providerService);
    const selectionResult = await selector.selectNextReview(owner, repo);

    if (selectionResult.status !== 'pr_selected') {
      return { type: 'error', message: selectionResult.message || 'PR selection failed', status: 400 };
    }

    // 3. Build Context
    const resolver = new DependencyResolver();
    const contextManager = new ContextManager(providerService, resolver);
    
    const contextPackage = await contextManager.buildContext(
      owner, 
      repo, 
      selectionResult.prNumber!, 
      selectionResult.commitSha!
    );

    if ('stage' in contextPackage) {
      if (
        contextPackage.message.includes('No supported source files') ||
        contextPackage.message.includes('No changed files')
      ) {
        const emptyReport = {
          scanId: `scan_${Date.now()}_empty`,
          repository: {
            owner,
            name: repo,
            prNumber: selectionResult.prNumber!,
            commitSha: selectionResult.commitSha!
          },
          verdict: 'NOT_VERIFIED',
          checkpoints: [],
          findings: { critical: [], warning: [], info: [] },
          coverage: {
            totalCheckpoints: 0,
            executedCheckpoints: 0,
            skippedCheckpoints: 0,
            notVerifiedCheckpoints: 0
          },
          totalFindings: 0,
          generatedAt: new Date().toISOString()
        };
        return { type: 'empty', data: emptyReport, message: contextPackage.message };
      }
      return { type: 'error', message: contextPackage.message, status: 400 };
    }

    // 4. Detect Sensitive Data
    const patternRegistry = new PatternRegistry();
    const detector = new SensitiveDataDetector(patternRegistry);
    const detectionResult = detector.detect(contextPackage);

    // 5. Sanitize Data
    const placeholderRegistry = new PlaceholderRegistry();
    const sanitizer = new SensitiveDataSanitizer(placeholderRegistry);
    const sanitizedPackage = sanitizer.sanitize(detectionResult);

    // 6. Validate Sanitization
    const validator = new SanitizationValidator(detector);
    try {
      validator.validate(contextPackage, sanitizedPackage);
    } catch (valErr: any) {
      console.error('Validation failed:', valErr.message);
      return { type: 'error', message: 'Internal error: Context sanitization validation failed.', status: 500 };
    }

    // 7. Orchestrate Review
    const provider = new OpenRouterProvider(standardModel);
    const orchestrator = new ReviewOrchestrator({ 
      provider,
      models: {
        standard: standardModel,
        major: majorModel
      }
    });

    const executionResult = await orchestrator.review(sanitizedPackage);

    return { type: 'success', data: executionResult };
  }
}
