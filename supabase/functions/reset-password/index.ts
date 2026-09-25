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

    // 5. Atomic ticket claim (short-lived lease, e.g. 30s)
    const ticketHash = await hashTicketSecret(ticket);
    const nowIso = new Date().toISOString();

    let userId: string | null = null;
    let ticketId: string | null = null;
    let claimId: string | null = null;
    let alreadyUpdated = false;

    try {
      const { data: rpcData } = await supabaseAdmin.rpc('claim_recovery_ticket_atomic', {
        p_ticket_hash: ticketHash,
        p_lease_seconds: 30,
      });
      if (Array.isArray(rpcData) && rpcData.length > 0) {
        userId = rpcData[0].user_id;
        ticketId = rpcData[0].ticket_id;
        claimId = rpcData[0].claim_id;
        alreadyUpdated = Boolean(rpcData[0].already_updated);
      }
    } catch {
      // Fallback
    }

    if (!userId) {
      const leaseExpiresIso = new Date(Date.now() + 30 * 1000).toISOString();
      const generatedClaimId = crypto.randomUUID();

      const { data: updated } = await supabaseAdmin
        .from('user_recovery_tickets')
        .update({
          claimed_at: nowIso,
          claim_expires_at: leaseExpiresIso,
          claim_id: generatedClaimId,
        })
        .eq('ticket_hash', ticketHash)
        .is('consumed_at', null)
        .is('revoked_at', null)
        .gt('expires_at', nowIso)
        .select('id, user_id, password_updated_at');

      if (updated && updated.length > 0) {
        userId = updated[0].user_id;
        ticketId = updated[0].id;
        claimId = generatedClaimId;
        alreadyUpdated = Boolean(updated[0].password_updated_at);
      }
    }

    if (!userId || !ticketId || !claimId) {
      return new Response(
        JSON.stringify({ error: 'INVALID_RECOVERY_TICKET', message: 'Invalid, expired, or actively claimed recovery session.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Idempotent recovery if password was already updated
    if (alreadyUpdated) {
      await supabaseAdmin.rpc('finalize_recovery_ticket_atomic', {
        p_ticket_id: ticketId,
        p_claim_id: claimId,
      }).catch(() => {});
      await supabaseAdmin.rpc('revoke_user_sessions_after_recovery', { p_user_id: userId }).catch(() => {});
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
    }

    // 6. Update user's password in Supabase Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      console.error('[reset-password] Error updating password in Supabase Auth');
      const isDefinite = updateError.status === 400 || updateError.status === 422;

      if (isDefinite) {
        // Definite validation failure: safely release claim
        await supabaseAdmin.rpc('release_recovery_ticket_claim', {
          p_ticket_id: ticketId,
          p_claim_id: claimId,
        }).catch(() => {
          return supabaseAdmin
            .from('user_recovery_tickets')
            .update({ claimed_at: null, claim_expires_at: null, claim_id: null })
            .eq('id', ticketId)
            .eq('claim_id', claimId);
        });

        return new Response(
          JSON.stringify({ error: 'INVALID_PASSWORD', message: updateError.message || 'Password validation failed.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Ambiguous outcome: attempt reconciliation probe
      let reconciled = false;
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (userData?.user?.email) {
          const probe = await supabaseAdmin.auth.signInWithPassword({
            email: userData.user.email,
            password: newPassword,
          });
          if (!probe.error && probe.data?.session) {
            reconciled = true;
          }
        }
      } catch {
        // Probe inconclusive
      }

      if (!reconciled) {
        // Fail closed: lock ticket into ambiguous state permanently
        await supabaseAdmin.rpc('mark_recovery_ticket_ambiguous', {
          p_ticket_id: ticketId,
          p_claim_id: claimId,
        }).catch(() => {
          return supabaseAdmin
            .from('user_recovery_tickets')
            .update({ ambiguous_at: nowIso, claim_expires_at: null })
            .eq('id', ticketId)
            .eq('claim_id', claimId);
        });

        return new Response(
          JSON.stringify({
            error: 'RECOVERY_TRANSACTION_UNCERTAIN',
            message: 'Unable to verify password update status due to network uncertainty. For security, this recovery session has been locked. If your password was updated, please log in with your new password. Otherwise, please start a new recovery session using one of your remaining backup recovery codes.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    }

    // 7. Finalize ticket consumption permanently
    await supabaseAdmin.rpc('record_recovery_password_updated', {
      p_ticket_id: ticketId,
      p_claim_id: claimId,
    }).catch(() => {});

    await supabaseAdmin.rpc('finalize_recovery_ticket_atomic', {
      p_ticket_id: ticketId,
      p_claim_id: claimId,
    }).catch(() => {
      return supabaseAdmin
        .from('user_recovery_tickets')
        .update({ consumed_at: nowIso, claim_expires_at: null })
        .eq('id', ticketId);
    });

    // 8. Revoke sessions & remaining tickets
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
