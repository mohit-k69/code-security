import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GENERIC_RECOVERY_ERROR = {
  error: 'INVALID_RECOVERY_ATTEMPT',
  message: 'Invalid account identifier or recovery code.',
};

const GENERIC_RATE_LIMIT_ERROR = {
  error: 'TOO_MANY_REQUESTS',
  message: 'Too many recovery attempts. Please try again later.',
};

const ACCOUNT_RATE_LIMIT_MAX = 5;
const IP_RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_TICKET_EXPIRY_MS = 15 * 60 * 1000;

function normalizeRecoveryCode(rawCode: string): string {
  if (!rawCode || typeof rawCode !== 'string') return '';
  return rawCode
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = normalizeRecoveryCode(code);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateTicketSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function isRateLimited(supabaseAdmin: any, key: string, maxAttempts: number): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('recovery_rate_limits')
      .select('*')
      .eq('rate_key', key)
      .single();

    if (data) {
      const now = Date.now();
      const blockedUntil = data.blocked_until ? new Date(data.blocked_until).getTime() : 0;
      if (blockedUntil > now) return true;

      const firstAttempt = new Date(data.first_attempt_at).getTime();
      if (now - firstAttempt < RATE_LIMIT_WINDOW_MS && data.attempts >= maxAttempts) {
        return true;
      }
    }
  } catch {
    // Graceful fallback
  }
  return false;
}

async function recordRateLimit(supabaseAdmin: any, key: string, maxAttempts: number): Promise<void> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  try {
    const { data } = await supabaseAdmin
      .from('recovery_rate_limits')
      .select('*')
      .eq('rate_key', key)
      .single();

    if (!data) {
      await supabaseAdmin.from('recovery_rate_limits').insert({
        rate_key: key,
        attempts: 1,
        first_attempt_at: nowIso,
        last_attempt_at: nowIso,
      });
    } else {
      const firstTime = new Date(data.first_attempt_at).getTime();
      if (now - firstTime >= RATE_LIMIT_WINDOW_MS) {
        await supabaseAdmin.from('recovery_rate_limits').update({
          attempts: 1,
          first_attempt_at: nowIso,
          last_attempt_at: nowIso,
          blocked_until: null,
        }).eq('rate_key', key);
      } else {
        const newAttempts = data.attempts + 1;
        const blockedUntilIso = newAttempts >= maxAttempts ? new Date(now + RATE_LIMIT_WINDOW_MS).toISOString() : null;
        await supabaseAdmin.from('recovery_rate_limits').update({
          attempts: newAttempts,
          last_attempt_at: nowIso,
          blocked_until: blockedUntilIso,
        }).eq('rate_key', key);
      }
    }
  } catch {
    // Ignore
  }
}

async function resetRateLimit(supabaseAdmin: any, key: string): Promise<void> {
  try {
    await supabaseAdmin.from('recovery_rate_limits').delete().eq('rate_key', key);
  } catch {
    // Ignore
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
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

    // Extract client IP securely:
    // In Edge Functions, trusted reverse proxy sets cf-connecting-ip or x-real-ip.
    // If evaluating x-forwarded-for, take the rightmost IP added by the trusted proxy,
    // preventing attackers from bypassing IP throttling by prepending fake IPs.
    const cfIp = req.headers.get('cf-connecting-ip');
    const xRealIp = req.headers.get('x-real-ip');
    const forwarded = req.headers.get('x-forwarded-for') || '';
    const forwardedHops = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    const clientIp = cfIp || xRealIp || (forwardedHops.length > 0 ? forwardedHops[forwardedHops.length - 1] : 'unknown-ip');

    const body = await req.json().catch(() => ({}));
    const rawIdentifier = body.email || body.identifier;
    const rawCode = body.code;

    const normalizedIdentifier = (rawIdentifier || '').trim().toLowerCase();
    const accountKey = `account:${normalizedIdentifier || 'unknown'}`;
    const ipKey = `ip:${clientIp}`;

    // 1. Strict rate limiting check
    const ipLimited = await isRateLimited(supabaseAdmin, ipKey, IP_RATE_LIMIT_MAX);
    const accountLimited = normalizedIdentifier
      ? await isRateLimited(supabaseAdmin, accountKey, ACCOUNT_RATE_LIMIT_MAX)
      : false;

    if (ipLimited || accountLimited) {
      return new Response(JSON.stringify(GENERIC_RATE_LIMIT_ERROR), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      });
    }

    // 2. Validate input
    const normalizedCode = normalizeRecoveryCode(rawCode || '');
    if (!normalizedIdentifier || !normalizedCode) {
      await recordRateLimit(supabaseAdmin, ipKey, IP_RATE_LIMIT_MAX);
      if (normalizedIdentifier) await recordRateLimit(supabaseAdmin, accountKey, ACCOUNT_RATE_LIMIT_MAX);

      return new Response(JSON.stringify(GENERIC_RECOVERY_ERROR), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const codeHash = await hashRecoveryCode(normalizedCode);

    // 3. User lookup without account enumeration
    let userId: string | null = null;
    try {
      let page = 1;
      while (page <= 10) {
        const { data: userPage } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
        if (!userPage?.users) break;

        for (const u of userPage.users) {
          if (u.email && u.email.trim().toLowerCase() === normalizedIdentifier) {
            userId = u.id;
            break;
          }
          for (const idn of u.identities || []) {
            if (idn.identity_data?.email && String(idn.identity_data.email).trim().toLowerCase() === normalizedIdentifier) {
              userId = u.id;
              break;
            }
          }
        }
        if (userId || userPage.users.length < 100) break;
        page++;
      }
    } catch {
      // Suppress
    }

    if (!userId) {
      // Timing mitigation
      await hashRecoveryCode('DUMMY-TIMING-MITIGATION-CODE');
      await recordRateLimit(supabaseAdmin, ipKey, IP_RATE_LIMIT_MAX);
      await recordRateLimit(supabaseAdmin, accountKey, ACCOUNT_RATE_LIMIT_MAX);

      return new Response(JSON.stringify(GENERIC_RECOVERY_ERROR), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 4. Atomic code consumption
    const nowIso = new Date().toISOString();
    let consumed = false;

    try {
      const { data: rpcSuccess } = await supabaseAdmin.rpc('consume_recovery_code', {
        p_user_id: userId,
        p_code_hash: codeHash,
      });
      consumed = Boolean(rpcSuccess);
    } catch {
      // Fallback to conditional update
      const { data: updated } = await supabaseAdmin
        .from('user_recovery_codes')
        .update({ consumed_at: nowIso })
        .eq('user_id', userId)
        .eq('code_hash', codeHash)
        .is('consumed_at', null)
        .is('revoked_at', null)
        .select('id');
      consumed = Boolean(updated && updated.length > 0);
    }

    if (!consumed) {
      await recordRateLimit(supabaseAdmin, ipKey, IP_RATE_LIMIT_MAX);
      await recordRateLimit(supabaseAdmin, accountKey, ACCOUNT_RATE_LIMIT_MAX);

      return new Response(JSON.stringify(GENERIC_RECOVERY_ERROR), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 5. Successful consumption: Reset account rate limit
    await resetRateLimit(supabaseAdmin, accountKey);

    // 6. Issue restricted recovery ticket
    const ticketSecret = generateTicketSecret();
    const ticketHash = await hashRecoveryCode(ticketSecret); // Reuse sha256 helper
    const expiresIso = new Date(Date.now() + RECOVERY_TICKET_EXPIRY_MS).toISOString();

    await supabaseAdmin.from('user_recovery_tickets').insert({
      user_id: userId,
      ticket_hash: ticketHash,
      created_at: nowIso,
      expires_at: expiresIso,
      consumed_at: null,
      revoked_at: null,
    });

    const cookieHeader = `recovery_ticket=${ticketSecret}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/recovery; Max-Age=900`;

    // CRITICAL: Deliver recovery ticket ONLY via secure HttpOnly cookie.
    // Plaintext recovery ticket is NEVER included in JSON response body.
    return new Response(
      JSON.stringify({
        success: true,
        expires_at: expiresIso,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Set-Cookie': cookieHeader,
        },
        status: 200,
      }
    );
  } catch (err: any) {
    console.error('[verify-recovery-code] Unexpected error occurred');
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
