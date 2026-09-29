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

    const { organization, project, repositoryId } = await req.json();
    if (!repositoryId) {
      return new Response(JSON.stringify({ error: 'Missing repositoryId parameter' }), {
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
      .eq('provider', 'azure')
      .single();

    if (dbError || !connection || !connection.access_token) {
      return new Response(JSON.stringify({ error: 'Azure DevOps is not connected. Please connect your Microsoft account.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    const azureToken = connection.access_token;
    const org = organization || 'default';
    const projScope = project ? `${org}/${project}` : org;

    const prsRes = await fetch(`https://dev.azure.com/${projScope}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/pullrequests?searchCriteria.status=active&$top=30&api-version=7.1-preview.1`, {
      headers: {
        'Authorization': `Bearer ${azureToken}`,
        'Accept': 'application/json',
        'User-Agent': 'CodeVibe-Edge-Function'
      }
    });

    if (!prsRes.ok) {
      if (prsRes.status === 401) {
        return new Response(JSON.stringify({ error: 'Azure DevOps connection expired. Please reconnect.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        });
      }
      return new Response(JSON.stringify({ error: 'Failed to fetch pull requests from Azure DevOps.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      });
    }

    const prsData = await prsRes.json();
    const mappedPRs = (prsData.value || []).map((pr: any) => ({
      id: pr.pullRequestId,
      number: pr.pullRequestId,
      title: pr.title || 'Untitled Pull Request',
      description: pr.description || '',
      state: pr.status?.toLowerCase() || 'open',
      draft: Boolean(pr.isDraft),
      created_at: pr.creationDate,
      updated_at: pr.creationDate,
      html_url: pr.url || '',
      author: {
        name: pr.createdBy?.displayName || 'Unknown',
        username: pr.createdBy?.uniqueName || 'unknown',
        avatar_url: pr.createdBy?._links?.avatar?.href || '',
      },
      source_branch: pr.sourceRefName?.replace(/^refs\/heads\//, '') || '',
      target_branch: pr.targetRefName?.replace(/^refs\/heads\//, '') || '',
      sha: pr.lastMergeSourceCommit?.commitId || pr.lastMergeCommit?.commitId || '',
    }));

    return new Response(JSON.stringify(mappedPRs), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('fetch-azure-prs error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error while fetching Azure DevOps pull requests.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
