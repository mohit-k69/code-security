
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async function handler(req: Request) {
  console.log('Function started.');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    console.log('Authorization header received.');

    // Initialize regular client with user's JWT to verify identity
    const supabaseClient = createClient(
      process.env['SUPABASE_URL'] ?? '',
      process.env['SUPABASE_ANON_KEY'] ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Extract the JWT from the Authorization header
    const token = authHeader.replace('Bearer ', '');
    console.log('Token extracted.');

    console.log('getUser(token) called.');
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }
    console.log('User successfully retrieved (user ID: ' + user.id + ').');

    const userId = user.id;

    // Initialize admin client with service role key to bypass RLS and delete auth record
    console.log('Admin client created.');
    const supabaseAdmin = createClient(
      process.env['SUPABASE_URL'] ?? '',
      process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''
    );

    // Delete data from all possible tables gracefully
    const tablesToClear = ['profiles', 'reviews', 'repositories', 'pull_requests', 'settings'];
    for (const table of tablesToClear) {
      console.log('Before deleting table: ' + table);
      const column = table === 'profiles' ? 'id' : 'user_id';
      
      const { error: deleteError } = await supabaseAdmin
        .from(table)
        .delete()
        .eq(column, userId);
      
      if (
        deleteError && 
        !deleteError.message?.includes('does not exist') && 
        !deleteError.message?.includes('relation') && 
        !deleteError.message?.includes('column') &&
        !deleteError.message?.includes('schema cache') &&
        !deleteError.message?.includes('Could not find the table')
      ) {
        throw new Error(`Failed to delete from ${table}: ${deleteError.message}`);
      }
      console.log('After successful table deletion: ' + table);
    }

    // Delete the Auth user
    console.log('Before auth.admin.deleteUser(userId).');
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      throw authDeleteError;
    }
    console.log('After successful auth deletion.');

    console.log('Before returning success.');
    return new Response(JSON.stringify({ success: true, message: 'Account deleted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Delete account function error:', error);
    console.error(JSON.stringify(error, null, 2));
    if (error?.stack) {
      console.error(error.stack);
    }
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
}
