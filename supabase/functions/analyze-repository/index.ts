import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { GithubService } from "./services/GithubService.ts";
import { PRSelector } from "./services/PRSelector.ts";
import { DependencyResolver } from "./services/DependencyResolver.ts";
import { ContextManager } from "./services/ContextManager.ts";
import { PatternRegistry } from "./services/PatternRegistry.ts";
import { SensitiveDataDetector } from "./services/SensitiveDataDetector.ts";
import { PlaceholderRegistry } from "./services/PlaceholderRegistry.ts";
import { SensitiveDataSanitizer } from "./services/SensitiveDataSanitizer.ts";
import { SanitizationValidator } from "./services/SanitizationValidator.ts";
import { OpenRouterProvider } from "./orchestrator/providers/OpenRouterProvider.ts";
import { ReviewOrchestrator } from "./orchestrator/ReviewOrchestrator.ts";

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

Deno.serve(async (req) => {
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
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // 2. Parse request body
    const { owner, repo } = await req.json();

    if (!owner || !repo) {
      return jsonResponse({ error: 'Missing owner or repo parameters.' }, 400);
    }

    // ---------------------------------------------------------
    // FUTURE CACHING IMPLEMENTATION
    // ---------------------------------------------------------
    // Check Cache
    // If cached -> return review immediately (e.g. from a 'code_reviews' table)
    // if (cachedReview) return jsonResponse(...)
    // Otherwise -> continue GitHub fetch
    // ---------------------------------------------------------

    // 3. Securely fetch OAuth token for the provider
    // Since only GitHub is supported today, explicitly query for it.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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

    const authProvider = connection.provider;

    // 4. Instantiate Provider Service
    let providerService;
    if (authProvider === 'github') {
      providerService = new GithubService(connection.access_token);
    } else {
      return jsonResponse({ error: `Provider ${authProvider} is not supported.` }, 400);
    }

    // 5. Use PR Selector Component v1.0
    // PR Selector autonomously decides the next PR. No user input required.
    const selector = new PRSelector(supabaseAdmin, providerService);
    const selectionResult = await selector.selectNextReview(owner, repo);

    if (selectionResult.status !== 'pr_selected') {
      return jsonResponse(selectionResult as unknown as Record<string, unknown>);
    }

    // 6. Use Context Manager Component v1.0
    const resolver = new DependencyResolver();
    const contextManager = new ContextManager(providerService, resolver);
    
    const contextPackage = await contextManager.buildContext(
      owner, 
      repo, 
      selectionResult.prNumber!, 
      selectionResult.commitSha!
    );

    if ('stage' in contextPackage) {
      return jsonResponse({ status: 'context_error', message: contextPackage.message });
    }

    // 7. Use Sensitive Data Detector Component v1.0
    const patternRegistry = new PatternRegistry();
    const detector = new SensitiveDataDetector(patternRegistry);
    const detectionResult = detector.detect(contextPackage);

    // 8. Use Sensitive Data Sanitizer Component v1.1
    const placeholderRegistry = new PlaceholderRegistry();
    const sanitizer = new SensitiveDataSanitizer(placeholderRegistry);
    const sanitizedPackage = sanitizer.sanitize(detectionResult);

    // 9. Validate Sanitization
    const validator = new SanitizationValidator(detector);
    try {
      validator.validate(contextPackage, sanitizedPackage);
    } catch (valErr: any) {
      console.error('Validation failed:', valErr.message);
      return jsonResponse({ status: 'validation_error', message: 'Internal error: Context sanitization validation failed.' }, 500);
    }

    // 10. Execute the Review Orchestrator
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterKey) {
      return jsonResponse({ error: 'Internal error: OPENROUTER_API_KEY not configured.' }, 500);
    }

    const llmModel = Deno.env.get('LLM_MODEL');
    if (!llmModel) {
      return jsonResponse({ error: 'Internal error: LLM_MODEL not configured.' }, 500);
    }

    const provider = new OpenRouterProvider(llmModel);
    const orchestrator = new ReviewOrchestrator({ provider });

    const executionResult = await orchestrator.review(sanitizedPackage);

    const isDebug = Deno.env.get('DEBUG_INSTRUMENTATION') === 'true';

    // Return the final result
    if (isDebug) {
      return jsonResponse(executionResult as unknown as Record<string, unknown>);
    } else {
      return jsonResponse({ report: executionResult.report } as unknown as Record<string, unknown>);
    }


  } catch (error: any) {
    console.error('analyze-repository error:', error.message);
    return jsonResponse({ error: 'Internal server error during analysis orchestration.' }, 500);
  }
});
