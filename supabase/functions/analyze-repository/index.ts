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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 });
    }

    // 2. Parse request body
    const { owner, repo, prNumber } = await req.json();

    if (!owner || !repo) {
      return new Response(JSON.stringify({ error: 'Missing owner or repo parameters.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    // ---------------------------------------------------------
    // FUTURE CACHING IMPLEMENTATION
    // ---------------------------------------------------------
    // Check Cache
    // If cached -> return review immediately (e.g. from a 'code_reviews' table)
    // if (cachedReview) return new Response(...)
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
      return new Response(JSON.stringify({ 
        error: 'GitHub is not connected. Please reconnect your GitHub account.' 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 });
    }

    const provider = connection.provider;

    // 4. Instantiate Provider Service
    let providerService;
    if (provider === 'github') {
      providerService = new GithubService(connection.access_token);
    } else {
      return new Response(JSON.stringify({ error: `Provider ${provider} is not supported.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
    }

    // 5. Use PR Selector Component v1.0
    // PR Selector autonomously decides the next PR. No user input required.
    const selector = new PRSelector(supabaseAdmin, providerService);
    const selectionResult = await selector.selectNextReview(owner, repo);

    if (selectionResult.status !== 'pr_selected') {
      return new Response(JSON.stringify(selectionResult), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 200 
      });
    }

    // Return the Context Package. 
    // Sensitive Data Detector (when built) will consume this output.
    const resolver = new DependencyResolver();
    const contextManager = new ContextManager(providerService, resolver);
    
    // We pass the output of PRSelector directly into the ContextManager.
    const contextPackage = await contextManager.buildContext(
      owner, 
      repo, 
      selectionResult.prNumber!, 
      selectionResult.commitSha!
    );

    if ('error' in contextPackage) {
      return new Response(JSON.stringify({ 
        status: 'context_error', 
        message: contextPackage.error 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // 7. Use Sensitive Data Detector Component v1.0
    // Scans the Context Package for secrets before sending to any downstream AI.
    const patternRegistry = new PatternRegistry();
    const detector = new SensitiveDataDetector(patternRegistry);
    
    const detectionResult = detector.detect(contextPackage);

    // 8. Use Sensitive Data Sanitizer Component v1.1
    // Replaces detected secrets with deterministic placeholders.
    const placeholderRegistry = new PlaceholderRegistry();
    const sanitizer = new SensitiveDataSanitizer(placeholderRegistry);
    const sanitizedPackage = sanitizer.sanitize(detectionResult);

    // 9. Validate Sanitization
    const validator = new SanitizationValidator(detector);
    try {
      validator.validate(contextPackage, sanitizedPackage);
    } catch (valErr: any) {
      console.error('Validation failed:', valErr.message);
      return new Response(JSON.stringify({ 
        status: 'validation_error', 
        message: 'Internal error: Context sanitization validation failed.' 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    // Return the Sanitized Context Package. 
    // Prompt Builder (when built) will consume this output.
    return new Response(JSON.stringify({
      status: 'sanitized_ready',
      context: sanitizedPackage
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 200 
    });

  } catch (error: any) {
    console.error('analyze-repository error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error during analysis orchestration.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
