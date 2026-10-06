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
      return new Response(JSON.stringify({ status: 'disconnected' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const githubToken = connection.access_token;
    const githubRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CodeVibe-Edge-Function'
      }
    });

    if (!githubRes.ok) {
      if (githubRes.status === 401) {
        return new Response(JSON.stringify({ status: 'expired' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }
      return new Response(JSON.stringify({ status: 'error' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const githubUser = await githubRes.json();

    return new Response(JSON.stringify({ status: 'connected', username: githubUser.login }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error: any) {
    console.error('check-github-connection error:', error.message);
    return new Response(JSON.stringify({ status: 'error' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
