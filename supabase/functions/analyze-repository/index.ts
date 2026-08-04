import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { GithubService } from "./services/GithubService.ts";

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

    // 5. Decision Matrix & Auto-Proceed Flow
    if (prNumber) {
      // The frontend already asked the user and passed the selected PR.
      return await performAnalysis(providerService, owner, repo, Number(prNumber));
    }

    // Otherwise, fetch open PRs to decide
    const openPrs = await providerService.getOpenPullRequests(owner, repo);

    if (openPrs.length === 0) {
      // No PRs
      return new Response(JSON.stringify({ 
        status: 'no_prs', 
        message: 'There are no open pull requests in this repository to analyze.' 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    } else if (openPrs.length > 1) {
      // Multiple PRs: return the lightweight list so the UI can ask the user
      return new Response(JSON.stringify({ 
        status: 'select_pr', 
        prs: openPrs 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    } else {
      // Exactly 1 PR: automatically proceed!
      return await performAnalysis(providerService, owner, repo, openPrs[0].number);
    }

  } catch (error: any) {
    console.error('analyze-repository error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error during analysis orchestration.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});

/**
 * Encapsulates the heavy-lifting logic once a specific PR is chosen.
 */
async function performAnalysis(service: GithubService, owner: string, repo: string, pullNumber: number): Promise<Response> {
  try {
    // 1. Fetch details, changed files, and diff in parallel for performance
    const [prDetails, changedFiles, diff] = await Promise.all([
      service.getPullRequestDetails(owner, repo, pullNumber),
      service.getChangedFiles(owner, repo, pullNumber),
      service.getDiff(owner, repo, pullNumber)
    ]);

    // 2. (Future) Feed this data to Gemini for analysis
    // const analysisResult = await geminiAnalyze(prDetails, changedFiles, diff);

    // 3. Return the consolidated successful result
    // The frontend only needs Review, Status, Metadata. Not GitHub internals.
    return new Response(JSON.stringify({
      status: 'analysis_data_ready',
      message: 'Successfully orchestrated backend fetching.',
      metadata: {
        prNumber: prDetails.number,
        title: prDetails.title
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error('Failed to perform analysis:', err.message);
    throw new Error('Failed to fetch required analysis data from provider.');
  }
}
