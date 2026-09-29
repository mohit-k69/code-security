import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

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
    // 1. Extract and Verify the incoming Supabase JWT
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

    // 2. Extract request parameters
    let projectId: string | number;
    try {
      const reqBody = await req.json();
      projectId = reqBody.projectId;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'Missing projectId parameter' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 3. Fetch the stored GitLab token securely using the Service Role Key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: connection, error: dbError } = await supabaseAdmin
      .from('oauth_connections')
      .select('access_token')
      .eq('user_id', user.id)
      .eq('provider', 'gitlab')
      .single();

    if (dbError || !connection || !connection.access_token) {
      console.warn('Failed to retrieve GitLab connection for user');
      return new Response(JSON.stringify({ error: 'GitLab connection not found. Please connect your account.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    const gitlabToken = connection.access_token;

    // 4. Call the GitLab REST API for Merge Requests
    const gitlabUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/merge_requests?state=all&order_by=updated_at&sort=desc&per_page=30`;
    
    const gitlabRes = await fetch(gitlabUrl, {
      headers: {
        'Authorization': `Bearer ${gitlabToken}`,
        'Accept': 'application/json',
        'User-Agent': 'CodeVibe-Edge-Function'
      }
    });

    if (!gitlabRes.ok) {
      if (gitlabRes.status === 401) {
        return new Response(JSON.stringify({ error: 'GitLab connection expired. Please reconnect.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        });
      }
      if (gitlabRes.status === 404) {
        return new Response(JSON.stringify({ error: 'GitLab project not found or inaccessible.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }
      
      console.error('GitLab API failure:', gitlabRes.statusText);
      return new Response(JSON.stringify({ error: 'Failed to fetch merge requests from GitLab.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      });
    }

    const mergeRequests = await gitlabRes.json();

    // 5. Map to clean, safe, provider-neutral fields
    const mappedMRs = mergeRequests.map((mr: any) => ({
      id: mr.id,
      iid: mr.iid,
      project_id: mr.project_id,
      title: mr.title,
      description: mr.description || '',
      state: mr.state, // 'opened' | 'closed' | 'merged'
      draft: Boolean(mr.draft || mr.work_in_progress),
      created_at: mr.created_at,
      updated_at: mr.updated_at,
      web_url: mr.web_url,
      author: {
        id: mr.author?.id,
        name: mr.author?.name || 'Unknown',
        username: mr.author?.username || 'unknown',
        avatar_url: mr.author?.avatar_url || '',
      },
      source_branch: mr.source_branch,
      target_branch: mr.target_branch,
      sha: mr.sha || mr.diff_head_sha || '',
    }));

    return new Response(JSON.stringify(mappedMRs), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('fetch-gitlab-merge-requests internal error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error while fetching merge requests.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
