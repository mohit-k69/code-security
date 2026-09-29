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
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .eq('provider', 'bitbucket')
      .single();

    if (dbError || !connection || !connection.access_token) {
      return new Response(JSON.stringify({ error: 'Bitbucket is not connected. Please connect your account.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    let bitbucketToken = connection.access_token;

    // Call Bitbucket API to get user repositories
    const bbRes = await fetch('https://api.bitbucket.org/2.0/repositories?role=contributor&sort=-updated_on&pagelen=100', {
      headers: {
        'Authorization': `Bearer ${bitbucketToken}`,
        'Accept': 'application/json',
        'User-Agent': 'CodeVibe-Edge-Function'
      }
    });

    if (!bbRes.ok) {
      if (bbRes.status === 401) {
        return new Response(JSON.stringify({ error: 'Bitbucket connection expired. Please reconnect.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        });
      }
      return new Response(JSON.stringify({ error: 'Failed to fetch repositories from Bitbucket.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      });
    }

    const bbData = await bbRes.json();
    const repos = (bbData.values || []).map((repo: any) => ({
      id: repo.uuid || repo.full_name,
      uuid: repo.uuid,
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner?.display_name || repo.owner?.username || repo.workspace?.slug || '',
      workspace: repo.workspace?.slug || repo.workspace?.name || '',
      description: repo.description || '',
      is_private: Boolean(repo.is_private),
      default_branch: repo.mainbranch?.name || 'main',
      updated_on: repo.updated_on,
      avatar_url: repo.links?.avatar?.href || '',
      html_url: repo.links?.html?.href || '',
    }));

    return new Response(JSON.stringify(repos), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('fetch-bitbucket-repos error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error while fetching Bitbucket repositories.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
