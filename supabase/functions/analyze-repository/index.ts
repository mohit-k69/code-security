import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { PipelineRunner } from "./orchestrator/PipelineRunner.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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

    const { owner, repo } = await req.json();

    if (!owner || !repo) {
      return jsonResponse({ error: 'Missing owner or repo parameters.' }, 400);
    }

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

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterKey) {
      return jsonResponse({ error: 'Internal error: OPENROUTER_API_KEY not configured.' }, 500);
    }

    const llmModel = Deno.env.get('LLM_MODEL');
    const standardModel = Deno.env.get('STANDARD_MODEL') || llmModel;
    const majorModel = Deno.env.get('MAJOR_MODEL') || standardModel;
    
    if (!standardModel || !majorModel) {
      return jsonResponse({ error: 'Internal error: LLM_MODEL or STANDARD_MODEL not configured.' }, 500);
    }

    const runner = new PipelineRunner();
    const result = await runner.run({
      owner,
      repo,
      supabaseAdmin,
      githubToken: connection.access_token,
      openRouterKey,
      standardModel,
      majorModel
    });

    const isDebug = Deno.env.get('DEBUG_INSTRUMENTATION') === 'true';

    switch (result.type) {
      case 'success':
        return isDebug 
          ? jsonResponse(result.data as unknown as Record<string, unknown>) 
          : jsonResponse({ report: result.data.report } as unknown as Record<string, unknown>);
      case 'empty':
        return isDebug 
          ? jsonResponse({ report: result.data, message: result.message }) 
          : jsonResponse({ report: result.data });
      case 'error':
        return jsonResponse({ error: result.message }, result.status);
    }

  } catch (error: any) {
    console.error('analyze-repository error:', error.message);
    return jsonResponse({ error: 'Internal server error during analysis orchestration.' }, 500);
  }
});
