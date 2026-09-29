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

    // 2. Fetch the stored GitLab token securely using the Service Role Key
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

    // 3. Call the GitLab REST API (Read-only project listing with pagination and sort)
    const gitlabRes = await fetch('https://gitlab.com/api/v4/projects?membership=true&simple=true&per_page=100&order_by=updated_at&sort=desc', {
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
      
      console.error('GitLab API failure:', gitlabRes.statusText);
      return new Response(JSON.stringify({ error: 'Failed to fetch projects from GitLab.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      });
    }

    const projects = await gitlabRes.json();

    // 4. Map to clean, safe, provider-neutral fields
    const mappedProjects = projects.map((project: any) => ({
      id: project.id,
      name: project.name,
      name_with_namespace: project.name_with_namespace || project.name,
      path: project.path,
      path_with_namespace: project.path_with_namespace || `${project.namespace?.path || ''}/${project.path}`,
      description: project.description || null,
      default_branch: project.default_branch || 'main',
      visibility: project.visibility || 'private',
      web_url: project.web_url,
      avatar_url: project.avatar_url || null,
      star_count: project.star_count || 0,
      last_activity_at: project.last_activity_at || project.updated_at || new Date().toISOString(),
      namespace: {
        id: project.namespace?.id,
        name: project.namespace?.name,
        path: project.namespace?.path,
        kind: project.namespace?.kind,
        full_path: project.namespace?.full_path,
        avatar_url: project.namespace?.avatar_url || null,
      }
    }));

    // 5. Return mapped projects
    return new Response(JSON.stringify(mappedProjects), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('fetch-gitlab-projects internal error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error while fetching GitLab projects.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
