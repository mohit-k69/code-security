import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { repoFullName } = await req.json();
    if (!repoFullName) {
      return new Response(JSON.stringify({ error: 'Missing repoFullName parameter' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: connection, error: dbError } = await supabaseAdmin
      .from('oauth_connections')
      .select('access_token')
      .eq('user_id', user.id)
      .eq('provider', 'bitbucket')
      .single();

    if (dbError || !connection || !connection.access_token) {
      return new Response(JSON.stringify({ error: 'Bitbucket is not connected. Please connect your account.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    const bbToken = connection.access_token;
    const prsRes = await fetch(`https://api.bitbucket.org/2.0/repositories/${repoFullName}/pullrequests?state=OPEN&pagelen=30`, {
      headers: {
        'Authorization': `Bearer ${bbToken}`,
        'Accept': 'application/json',
        'User-Agent': 'CodeVibe-Edge-Function'
      }
    });

    if (!prsRes.ok) {
      if (prsRes.status === 401) {
        return new Response(JSON.stringify({ error: 'Bitbucket connection expired. Please reconnect.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        });
      }
      return new Response(JSON.stringify({ error: 'Failed to fetch pull requests from Bitbucket.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      });
    }

    const prsData = await prsRes.json();
    const mappedPRs = (prsData.values || []).map((pr: any) => ({
      id: pr.id,
      number: pr.id,
      title: pr.title,
      description: pr.description || '',
      state: pr.state?.toLowerCase() || 'open',
      created_at: pr.created_on,
      updated_at: pr.updated_on,
      html_url: pr.links?.html?.href || '',
      author: {
        name: pr.author?.display_name || pr.author?.nickname || 'Unknown',
        username: pr.author?.username || pr.author?.nickname || 'unknown',
        avatar_url: pr.author?.links?.avatar?.href || '',
      },
      source_branch: pr.source?.branch?.name || '',
      target_branch: pr.destination?.branch?.name || '',
      sha: pr.source?.commit?.hash || '',
    }));

    return new Response(JSON.stringify(mappedPRs), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('fetch-bitbucket-prs error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error while fetching Bitbucket pull requests.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
