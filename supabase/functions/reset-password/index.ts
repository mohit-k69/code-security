import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getCookieValue(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function hashTicketSecret(ticket: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ticket.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 1. POST is strictly mandatory
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed. POST is required.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  // 2. CSRF & Sec-Fetch-Site check
  const secFetchSite = (req.headers.get('sec-fetch-site') || '').toLowerCase();
  if (secFetchSite === 'cross-site') {
    return new Response(JSON.stringify({ error: 'CSRF_VALIDATION_FAILED', message: 'Cross-origin request forbidden.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 403,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Extract recovery ticket ONLY from HttpOnly cookie
    const cookieHeader = req.headers.get('cookie');
    const ticket = getCookieValue(cookieHeader, 'recovery_ticket');

    if (!ticket || ticket.length !== 64) {
      return new Response(
        JSON.stringify({ error: 'INVALID_RECOVERY_TICKET', message: 'Invalid or missing recovery ticket.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const newPassword = body.newPassword;
    const confirmPassword = body.confirmPassword;

    // 4. Validate password input
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'INVALID_PASSWORD', message: 'Password must be at least 6 characters.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return new Response(
        JSON.stringify({ error: 'PASSWORD_CONFIRMATION_MISMATCH', message: 'Password confirmation does not match.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 5. Atomic ticket consumption
    const ticketHash = await hashTicketSecret(ticket);
    const nowIso = new Date().toISOString();

    let userId: string | null = null;
    let ticketId: string | null = null;

    try {
      const { data: rpcData } = await supabaseAdmin.rpc('consume_recovery_ticket_atomic', {
        p_ticket_hash: ticketHash,
      });
      if (Array.isArray(rpcData) && rpcData.length > 0) {
        userId = rpcData[0].user_id;
        ticketId = rpcData[0].ticket_id;
      }
    } catch {
      // Fallback
    }

    if (!userId) {
      const { data: updated } = await supabaseAdmin
        .from('user_recovery_tickets')
        .update({ consumed_at: nowIso })
        .eq('ticket_hash', ticketHash)
        .is('consumed_at', null)
        .is('revoked_at', null)
        .gt('expires_at', nowIso)
        .select('id, user_id');

      if (updated && updated.length > 0) {
        userId = updated[0].user_id;
        ticketId = updated[0].id;
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'INVALID_RECOVERY_TICKET', message: 'Invalid or expired recovery session.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 6. Update user's password in Supabase Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      console.error('[reset-password] Error updating password in Supabase Auth');
      return new Response(
        JSON.stringify({ error: 'PASSWORD_RESET_FAILED', message: 'Unable to update password. Please try again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // 7. Revoke sessions & remaining tickets
    try {
      await supabaseAdmin.rpc('revoke_user_sessions_after_recovery', { p_user_id: userId });
    } catch {
      // Ignore
    }

    // Clear recovery cookie
    const clearCookieHeader = 'recovery_ticket=; Path=/api/auth/recovery; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';

    return new Response(
      JSON.stringify({ success: true, message: 'Password reset successfully.' }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Set-Cookie': clearCookieHeader,
        },
        status: 200,
      }
    );
  } catch (err: any) {
    console.error('[reset-password] Unexpected error');
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
