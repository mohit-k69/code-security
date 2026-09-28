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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // 2. Extract request parameters
    let owner: string;
    let repo: string;
    try {
      const reqBody = await req.json();
      owner = reqBody.owner;
      repo = reqBody.repo;
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (!owner || !repo) {
      return new Response(JSON.stringify({ error: 'Missing owner or repo parameters' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 3. Fetch the stored GitHub token securely using the Service Role Key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: connection, error: dbError } = await supabaseAdmin
      .from('oauth_connections')
      .select('access_token')
      .eq('user_id', user.id)
      .eq('provider', 'github')
      .single();

    if (dbError || !connection || !connection.access_token) {
      console.error('Failed to retrieve GitHub connection for user');
      return new Response(JSON.stringify({ error: 'GitHub connection not found. Please connect your account.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    const githubToken = connection.access_token;

    // 4. Call the GitHub REST API
    const githubUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=all&sort=updated&direction=desc`;
    
    const githubRes = await fetch(githubUrl, {
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CodeVibe-Edge-Function'
      }
    });

    if (!githubRes.ok) {
      if (githubRes.status === 401) {
        return new Response(JSON.stringify({ error: 'GitHub connection expired. Please reconnect.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        });
      }
      
      if (githubRes.status === 404) {
        return new Response(JSON.stringify({ error: 'Repository not found on GitHub or access denied.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }
      
      console.error(`GitHub API failure (${githubRes.status}):`, githubRes.statusText);
      return new Response(JSON.stringify({ error: 'Failed to fetch pull requests from GitHub.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      });
    }

    const pulls = await githubRes.json();

    // 5. Map to only the required fields to prevent over-fetching
    const mappedPulls = pulls.map((pr: any) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      draft: pr.draft,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      html_url: pr.html_url,
      user: {
        login: pr.user?.login,
        avatar_url: pr.user?.avatar_url,
      },
      head: {
        ref: pr.head?.ref,
      },
      base: {
        ref: pr.base?.ref,
      }
    }));

    // 6. Return the mapped data
    return new Response(JSON.stringify(mappedPulls), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    // Log internal error safely on the server
    console.error('fetch-github-pull-requests internal error:', error.message);
    
    return new Response(JSON.stringify({ error: 'Internal server error while fetching pull requests.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
