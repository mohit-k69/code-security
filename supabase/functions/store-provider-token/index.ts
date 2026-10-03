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
    const { providerToken, providerRefreshToken, provider: requestedProvider } = reqBody;

    if (!providerToken) {
      throw new Error('Missing provider token');
    }

    const validProviders = ['github', 'gitlab', 'bitbucket', 'azure'];
    if (!requestedProvider || !validProviders.includes(requestedProvider)) {
      throw new Error('Missing or invalid provider');
    }
    const provider = requestedProvider;

    // 1. Verify the incoming Supabase JWT to get the user ID
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // 2. Validate the token by fetching the user profile from the respective provider
    let providerUserId = '';

    if (provider === 'gitlab') {
      const gitlabUserRes = await fetch('https://gitlab.com/api/v4/user', {
        headers: {
          'Authorization': `Bearer ${providerToken}`,
          'Accept': 'application/json',
          'User-Agent': 'CodeVibe-Edge-Function'
        }
      });

      if (!gitlabUserRes.ok) {
        throw new Error('Failed to validate GitLab token with provider');
      }

      const gitlabUser = await gitlabUserRes.json();
      providerUserId = String(gitlabUser.id);
    } else if (provider === 'bitbucket') {
      const bbUserRes = await fetch('https://api.bitbucket.org/2.0/user', {
        headers: {
          'Authorization': `Bearer ${providerToken}`,
          'Accept': 'application/json',
          'User-Agent': 'CodeVibe-Edge-Function'
        }
      });

      if (!bbUserRes.ok) {
        throw new Error('Failed to validate Bitbucket token with provider');
      }

      const bbUser = await bbUserRes.json();
      providerUserId = String(bbUser.account_id || bbUser.uuid || bbUser.username || 'bitbucket_user');
    } else if (provider === 'azure') {
      const azureUserRes = await fetch('https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0', {
        headers: {
          'Authorization': `Bearer ${providerToken}`,
          'Accept': 'application/json',
          'User-Agent': 'CodeVibe-Edge-Function'
        }
      });

      if (azureUserRes.ok) {
        const azureUser = await azureUserRes.json();
        providerUserId = String(azureUser.id || azureUser.publicAlias || 'azure_user');
      } else {
        providerUserId = user.id;
      }
    } else {
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
      providerUserId = String(githubUser.id);
    }

    if (!providerUserId) {
      throw new Error(`Failed to extract ${provider} user ID`);
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
    console.error('store-provider-token internal error:', error?.message || error, error?.stack);
    
    // Return a descriptive error message to the client
    return new Response(JSON.stringify({ error: error?.message || 'Unable to store provider connection.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
