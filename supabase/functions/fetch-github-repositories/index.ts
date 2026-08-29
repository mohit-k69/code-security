import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async function handler(req: Request) {
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
      process.env['SUPABASE_URL'] ?? '',
      process.env['SUPABASE_ANON_KEY'] ?? '',
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

    // 2. Fetch the stored GitHub token securely using the Service Role Key
    const supabaseAdmin = createClient(
      process.env['SUPABASE_URL'] ?? '',
      process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''
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
        status: 404, // or 400, but 404 indicates missing resource
      });
    }

    const githubToken = connection.access_token;

    // 3. Call the GitHub REST API
    // We add per_page=100 and sort by updated to get the most relevant repos first
    const githubRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CodeVibe-Edge-Function'
      }
    });

    if (!githubRes.ok) {
      // If unauthorized, token might be expired or revoked
      if (githubRes.status === 401) {
        return new Response(JSON.stringify({ error: 'GitHub connection expired. Please reconnect.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        });
      }
      
      console.error('GitHub API failure:', githubRes.statusText);
      return new Response(JSON.stringify({ error: 'Failed to fetch repositories from GitHub.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502, // Bad Gateway
      });
    }

    const repos = await githubRes.json();

    // 4. Map to only the required fields to prevent over-fetching and minimize payload size
    const mappedRepos = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      description: repo.description,
      default_branch: repo.default_branch,
      language: repo.language,
      updated_at: repo.updated_at,
      owner: {
        login: repo.owner?.login,
        avatar_url: repo.owner?.avatar_url,
      }
    }));

    // 5. Return the mapped data
    return new Response(JSON.stringify(mappedRepos), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    // Log internal error safely on the server
    console.error('fetch-github-repositories internal error:', error.message);
    
    return new Response(JSON.stringify({ error: 'Internal server error while fetching repositories.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}
