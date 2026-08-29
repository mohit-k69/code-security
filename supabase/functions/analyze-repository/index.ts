import { createClient } from "@supabase/supabase-js";
import { GithubService } from "./services/GithubService";
import { PRSelector } from "./services/PRSelector";
import { DependencyResolver } from "./services/DependencyResolver";
import { ContextManager } from "./services/ContextManager";
import { PatternRegistry } from "./services/PatternRegistry";
import { SensitiveDataDetector } from "./services/SensitiveDataDetector";
import { PlaceholderRegistry } from "./services/PlaceholderRegistry";
import { SensitiveDataSanitizer } from "./services/SensitiveDataSanitizer";
import { SanitizationValidator } from "./services/SanitizationValidator";

import { CheckpointRunner } from "./services/CheckpointRunner";
import { SECURITY_REVIEW_FRAMEWORK } from "./prompts/SecurityReviewFramework";
import { AuthenticationSpec } from "./prompts/specifications/AuthenticationSpec";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Response Helper ─────────────────────────────────────────────
// Eliminates 9 identical response-construction patterns.

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

export default async function handler(req: Request) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'No authorization header' }, 401);
    }

    const supabaseClient = createClient(
      process.env['SUPABASE_URL'] ?? '',
      process.env['SUPABASE_ANON_KEY'] ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // 2. Parse request body
    const body = await req.json();
    const { owner, repo, prNumber } = body;

    if (!owner || !repo) {
      return jsonResponse({ error: 'Missing owner or repo parameters.' }, 400);
    }

    // 3. Securely fetch OAuth token for the provider
    const supabaseAdmin = createClient(
      process.env['SUPABASE_URL'] ?? '',
      process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''
    );

    const { data: connection, error: dbError } = await supabaseAdmin
      .from('oauth_connections')
      .select('provider, access_token')
      .eq('user_id', user.id)
      .eq('provider', 'github')
      .single();

    if (dbError || !connection || !connection.access_token) {
      return jsonResponse({ error: 'GitHub is not connected. Please reconnect your GitHub account.' }, 404);
    }

    const provider = connection.provider;

    // 4. Instantiate Provider Service
    let providerService: GithubService;
    if (provider === 'github') {
      providerService = new GithubService(connection.access_token);
    } else {
      return jsonResponse({ error: `Provider ${provider} is not supported.` }, 400);
    }

    let targetPrNumber: number = 1;
    let targetCommitSha: string = '';

    // 5. Select PR or Commit
    if (prNumber) {
      // User selected a specific PR
      try {
        const prDetails = await providerService.getPullRequestDetails(owner, repo, prNumber);
        targetPrNumber = prDetails.number;
        targetCommitSha = prDetails.head.sha;
      } catch (err: any) {
        console.error('Failed to fetch specific PR details:', err.message);
        return jsonResponse({ error: `Failed to fetch PR #${prNumber} details.` }, 400);
      }
    } else {
      // PR Selector autonomously decides the next PR
      const selector = new PRSelector(supabaseAdmin, providerService);
      const selectionResult = await selector.selectNextReview(owner, repo);

      if (selectionResult.status === 'pr_selected') {
        targetPrNumber = selectionResult.prNumber!;
        targetCommitSha = selectionResult.commitSha!;
      } else {
        // Fallback: If no open PRs, check latest commit on default branch
        try {
          const commits = await providerService.getLatestCommits(owner, repo);
          if (commits && commits.length > 0) {
            targetPrNumber = 0; // indicates commit/branch review
            targetCommitSha = commits[0].sha;
          } else {
            return jsonResponse({ status: 'no_prs', message: 'No commits or PRs found for this repository.' });
          }
        } catch (commitErr: any) {
          console.warn('Commit fallback failed, returning PR selection result:', commitErr.message);
          return jsonResponse(selectionResult as unknown as Record<string, unknown>);
        }
      }
    }

    // 6. Use Context Manager Component
    const resolver = new DependencyResolver();
    const contextManager = new ContextManager(providerService, resolver);
    
    let contextPackage;
    if (targetPrNumber > 0) {
      contextPackage = await contextManager.buildContext(owner, repo, targetPrNumber, targetCommitSha);
    } else {
      // Build context for latest commit
      const commitFiles = await providerService.getCommitFiles(owner, repo, targetCommitSha);
      const changedFiles = [];
      for (const file of commitFiles.slice(0, 20)) {
        if (file.status === 'removed') continue;
        try {
          const content = await providerService.getFileContent(owner, repo, file.filename, targetCommitSha);
          changedFiles.push({ path: file.filename, content, deleted: false });
        } catch (e) {
          // ignore
        }
      }
      contextPackage = {
        repository: `${owner}/${repo}`,
        prNumber: 0,
        commitSha: targetCommitSha,
        changedFiles,
        dependencies: [],
        missingDependencies: [],
        metadata: { totalFiles: changedFiles.length, totalChars: 0, truncated: false }
      };
    }

    if ('stage' in contextPackage) {
      return jsonResponse({ status: 'context_error', message: contextPackage.message });
    }

    // 7. Use Sensitive Data Detector Component
    const patternRegistry = new PatternRegistry();
    const detector = new SensitiveDataDetector(patternRegistry);
    const detectionResult = detector.detect(contextPackage as any);

    // 8. Use Sensitive Data Sanitizer Component
    const placeholderRegistry = new PlaceholderRegistry();
    const sanitizer = new SensitiveDataSanitizer(placeholderRegistry);
    const sanitizedPackage = sanitizer.sanitize(detectionResult);

    // 9. Validate Sanitization
    const validator = new SanitizationValidator(detector);
    try {
      validator.validate(contextPackage as any, sanitizedPackage);
    } catch (valErr: any) {
      console.error('Validation failed:', valErr.message);
    }

    // 10. Run Checkpoint Analysis
    const runner = new CheckpointRunner();
    const checkpointResult = await runner.run(sanitizedPackage, SECURITY_REVIEW_FRAMEWORK, AuthenticationSpec);

    return jsonResponse({
      status: 'analysis_data_ready',
      metadata: checkpointResult,
      prNumber: targetPrNumber
    });

  } catch (error: any) {
    console.error('analyze-repository error:', error.message);
    return jsonResponse({ error: 'Internal server error during analysis orchestration.' }, 500);
  }
}
