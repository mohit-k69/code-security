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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: connection, error: dbError } = await supabaseAdmin
      .from('oauth_connections')
      .select('access_token, provider_user_id')
      .eq('user_id', user.id)
      .eq('provider', 'azure')
      .single();

    if (dbError || !connection || !connection.access_token) {
      return new Response(JSON.stringify({ error: 'Azure DevOps is not connected. Please connect your Microsoft account.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    const azureToken = connection.access_token;

    // 1. Get Accounts / Organizations for user
    let orgNames: string[] = [];
    try {
      const orgsRes = await fetch('https://app.vssps.visualstudio.com/_apis/accounts?memberId=' + (connection.provider_user_id || '') + '&api-version=6.0', {
        headers: {
          'Authorization': `Bearer ${azureToken}`,
          'Accept': 'application/json',
          'User-Agent': 'CodeVibe-Edge-Function'
        }
      });
      if (orgsRes.ok) {
        const orgsData = await orgsRes.json();
        orgNames = (orgsData.value || []).map((o: any) => o.accountName);
      }
    } catch {
      // Fallback to connection or env default
    }

    if (orgNames.length === 0) {
      orgNames = ['default'];
    }

    const allRepos: any[] = [];

    for (const org of orgNames) {
      try {
        const reposRes = await fetch(`https://dev.azure.com/${org}/_apis/git/repositories?api-version=7.1-preview.1`, {
          headers: {
            'Authorization': `Bearer ${azureToken}`,
            'Accept': 'application/json',
            'User-Agent': 'CodeVibe-Edge-Function'
          }
        });

        if (reposRes.ok) {
          const reposData = await reposRes.json();
          for (const repo of (reposData.value || [])) {
            allRepos.push({
              id: repo.id,
              name: repo.name,
              project_name: repo.project?.name || '',
              organization: org,
              full_name: `${org}/${repo.project?.name || 'default'}/${repo.name}`,
              default_branch: repo.defaultBranch?.replace('refs/heads/', '') || 'main',
              web_url: repo.webUrl || repo.url || '',
              is_private: true,
              size: repo.size || 0,
            });
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch repos for org ${org}:`, e);
      }
    }

    return new Response(JSON.stringify(allRepos), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('fetch-azure-repos error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error while fetching Azure DevOps repositories.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
