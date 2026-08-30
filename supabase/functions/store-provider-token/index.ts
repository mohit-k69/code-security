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
      throw new Error('No authorization header');
    }

    const reqBody = await req.json();
    const { providerToken, providerRefreshToken } = reqBody;

    if (!providerToken) {
      throw new Error('Missing provider token');
    }

    const provider = 'github'; // Hardcode provider, do not trust client input

    // 1. Verify the incoming Supabase JWT to get the user ID
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // 2. Validate the GitHub token by fetching the GitHub user profile
    const githubUserRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${providerToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CodeVibe-Edge-Function'
      }
    });

    if (!githubUserRes.ok) {
      throw new Error('Failed to validate GitHub token with provider');
    }

    const githubUser = await githubUserRes.json();
    const providerUserId = String(githubUser.id);

    if (!providerUserId) {
      throw new Error('Failed to extract GitHub user ID');
    }

    // 3. Upsert the token into the database securely using the Service Role Key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: upsertError } = await supabaseAdmin
      .from('oauth_connections')
      .upsert({
        user_id: user.id,
        provider: provider,
        provider_user_id: providerUserId,
        access_token: providerToken,
        refresh_token: providerRefreshToken || null,
        expires_at: null,
      }, { onConflict: 'user_id,provider' });

    if (upsertError) {
      // Intentionally obfuscating the error to avoid leaking details
      console.error('Database upsert failed:', upsertError.message);
      throw new Error('Failed to persist connection');
    }

    // Do NOT return or log the token
    return new Response(JSON.stringify({ success: true, message: 'Provider connection secured' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    // Log detailed errors securely on the server
    console.error('store-provider-token internal error:', error.message);
    
    // Return a generic, safe error message to the client
    return new Response(JSON.stringify({ error: 'Unable to store GitHub connection.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
