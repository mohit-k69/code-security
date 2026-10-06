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

    // Delete the oauth_connections row
    const { error: deleteError } = await supabaseAdmin
      .from('oauth_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'github');

    if (deleteError) {
      console.error('Failed to delete oauth_connection:', deleteError);
      return new Response(JSON.stringify({ error: 'Failed to disconnect.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    // Attempt to unlink the old Supabase auth identity if it exists, so `user.isGithubLinked` clears.
    // This is a safe cleanup for older linkIdentity users.
    const { data: identities } = await supabaseAdmin.auth.admin.getUserById(user.id);
    const githubIdentity = identities?.user?.identities?.find((id: any) => id.provider === 'github');
    
    if (githubIdentity) {
      try {
        await supabaseAdmin.auth.admin.unlinkIdentity(user.id, githubIdentity);
      } catch (e) {
        console.warn('Failed to unlink legacy github identity:', e);
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error: any) {
    console.error('disconnect-github error:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
