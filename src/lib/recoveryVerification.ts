/**
 * Recovery Code Verification and Restricted Authorization Module (Phase 2)
 *
 * Implements:
 * 1. Constant-time, anti-enumeration user lookup
 * 2. Input normalization and SHA-256 verifier checking (reusing Phase 1 primitives)
 * 3. Race-condition safe atomic single-use code consumption
 * 4. Dual-layer rate limiting (IP and account identifier)
 * 5. Issuance of short-lived, high-entropy, restricted recovery authorization tickets
 * 6. Protection against session confusion and logging leakage
 */

import {
  normalizeRecoveryCode,
  hashRecoveryCode,
} from './recoveryCodes';

// Configuration constants
export const RECOVERY_TICKET_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
export const ACCOUNT_RATE_LIMIT_MAX = 5;                  // Max 5 failed attempts per account
export const IP_RATE_LIMIT_MAX = 15;                     // Max 15 attempts per IP
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;      // 15-minute sliding window

export const GENERIC_RECOVERY_ERROR = {
  error: 'INVALID_RECOVERY_ATTEMPT',
  message: 'Invalid account identifier or recovery code.',
};

export const GENERIC_RATE_LIMIT_ERROR = {
  error: 'TOO_MANY_REQUESTS',
  message: 'Too many recovery attempts. Please try again later.',
};

export interface VerificationResult {
  success: boolean;
  status: number;
  ticket?: string; // Private to server runtime for HttpOnly cookie issuance. NEVER serialized into JSON response body.
  body: {
    success?: boolean;
    expires_at?: string;
    error?: string;
    message?: string;
  };
}

// In-memory sliding window rate-limit cache (fast path)
interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  blockedUntil?: number;
}
const memoryRateLimits = new Map<string, RateLimitEntry>();

export function clearMemoryRateLimits(): void {
  memoryRateLimits.clear();
}

/**
 * Checks in-memory and database rate limits.
 * Returns true if rate limit exceeded.
 */
export async function isRateLimited(
  supabaseAdmin: any,
  key: string,
  maxAttempts: number,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): Promise<boolean> {
  const now = Date.now();

  // 1. Fast in-memory check
  const mem = memoryRateLimits.get(key);
  if (mem) {
    if (mem.blockedUntil && mem.blockedUntil > now) {
      return true;
    }
    if (now - mem.firstAttempt < windowMs) {
      if (mem.attempts >= maxAttempts) {
        mem.blockedUntil = now + windowMs;
        return true;
      }
    } else {
      // Window expired, reset
      memoryRateLimits.delete(key);
    }
  }

  // 2. Persistent database check (if table available)
  if (supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin
        .from('recovery_rate_limits')
        .select('*')
        .eq('rate_key', key)
        .single();

      if (data) {
        const blockedUntilTime = data.blocked_until ? new Date(data.blocked_until).getTime() : 0;
        if (blockedUntilTime > now) {
          return true;
        }
        const firstAttemptTime = new Date(data.first_attempt_at).getTime();
        if (now - firstAttemptTime < windowMs && data.attempts >= maxAttempts) {
          return true;
        }
      }
    } catch {
      // Fallback gracefully to in-memory check
    }
  }

  return false;
}

/**
 * Increments the failure attempt count for a rate-limit key.
 */
export async function recordRateLimitAttempt(
  supabaseAdmin: any,
  key: string,
  maxAttempts: number,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): Promise<void> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // 1. Update in-memory entry
  const mem = memoryRateLimits.get(key);
  if (!mem || now - mem.firstAttempt >= windowMs) {
    memoryRateLimits.set(key, { attempts: 1, firstAttempt: now });
  } else {
    mem.attempts += 1;
    if (mem.attempts >= maxAttempts) {
      mem.blockedUntil = now + windowMs;
    }
  }

  // 2. Update database entry
  if (supabaseAdmin) {
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
        if (now - firstTime >= windowMs) {
          await supabaseAdmin.from('recovery_rate_limits').update({
            attempts: 1,
            first_attempt_at: nowIso,
            last_attempt_at: nowIso,
            blocked_until: null,
          }).eq('rate_key', key);
        } else {
          const newAttempts = data.attempts + 1;
          const blockedUntilIso = newAttempts >= maxAttempts ? new Date(now + windowMs).toISOString() : null;
          await supabaseAdmin.from('recovery_rate_limits').update({
            attempts: newAttempts,
            last_attempt_at: nowIso,
            blocked_until: blockedUntilIso,
          }).eq('rate_key', key);
        }
      }
    } catch {
      // Silent catch to prevent leaking internal database issues
    }
  }
}

/**
 * Resets the rate limit after a successful recovery operation.
 */
export async function resetRateLimit(supabaseAdmin: any, key: string): Promise<void> {
  memoryRateLimits.delete(key);
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('recovery_rate_limits').delete().eq('rate_key', key);
    } catch {
      // Ignore
    }
  }
}

/**
 * Looks up a user by account identifier (email) without exposing account presence.
 */
export async function findUserIdByIdentifier(
  supabaseAdmin: any,
  identifier: string
): Promise<string | null> {
  if (!identifier || typeof identifier !== 'string') {
    return null;
  }

  const normalized = identifier.trim().toLowerCase();

  try {
    let page = 1;
    const perPage = 100;
    const maxPages = 10;

    while (page <= maxPages) {
      const result = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (result.error || !result.data?.users) {
        break;
      }

      for (const u of result.data.users) {
        if (u.email && u.email.trim().toLowerCase() === normalized) {
          return u.id;
        }
        const identities = u.identities || [];
        for (const ident of identities) {
          const identEmail = ident.identity_data?.email;
          if (identEmail && String(identEmail).trim().toLowerCase() === normalized) {
            return u.id;
          }
        }
        const metaEmail = u.user_metadata?.email;
        if (metaEmail && String(metaEmail).trim().toLowerCase() === normalized) {
          return u.id;
        }
      }

      if (result.data.users.length < perPage) {
        break;
      }
      page++;
    }
  } catch {
    // Suppress internal lookup errors to avoid leaking information
  }

  return null;
}

/**
 * Generates a high-entropy 256-bit recovery ticket for restricted authorization.
 */
export function generateRecoveryTicketSecret(): string {
  const bytes = new Uint8Array(32); // 256 bits
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes SHA-256 hash of a recovery ticket secret.
 */
export async function hashTicketSecret(ticket: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ticket.trim());
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Atomically consumes a recovery code for the given user.
 * Race-condition safe: ensures two concurrent requests cannot both consume the same code.
 */
export async function atomicallyConsumeRecoveryCode(
  supabaseAdmin: any,
  userId: string,
  codeHash: string
): Promise<boolean> {
  // 1. Try atomic PostgreSQL RPC if available
  try {
    const { data, error } = await supabaseAdmin.rpc('consume_recovery_code', {
      p_user_id: userId,
      p_code_hash: codeHash,
    });
    if (!error && typeof data === 'boolean') {
      return data;
    }
  } catch {
    // Fall back to direct atomic conditional UPDATE
  }

  // 2. Direct atomic conditional UPDATE:
  // In PostgreSQL, row locks ensure that among concurrent UPDATEs matching the WHERE condition,
  // the first one updates the row and sets consumed_at = now(). The subsequent UPDATE re-evaluates
  // the WHERE condition, finds consumed_at IS NOT NULL, and updates 0 rows.
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('user_recovery_codes')
    .update({ consumed_at: nowIso })
    .eq('user_id', userId)
    .eq('code_hash', codeHash)
    .is('consumed_at', null)
    .is('revoked_at', null)
    .select('id');

  if (error || !data || data.length === 0) {
    return false;
  }

  return true;
}

/**
 * Creates and stores a restricted recovery ticket in public.user_recovery_tickets.
 * Only the SHA-256 hash is persisted; plaintext is returned strictly once.
 */
export async function issueRecoveryTicket(
  supabaseAdmin: any,
  userId: string,
  expiryMs: number = RECOVERY_TICKET_EXPIRY_MS
): Promise<{ ticket: string; expiresInSeconds: number; expiresAt: string }> {
  const ticketSecret = generateRecoveryTicketSecret();
  const ticketHash = await hashTicketSecret(ticketSecret);

  const now = Date.now();
  const createdIso = new Date(now).toISOString();
  const expiresIso = new Date(now + expiryMs).toISOString();

  const { error } = await supabaseAdmin.from('user_recovery_tickets').insert({
    user_id: userId,
    ticket_hash: ticketHash,
    created_at: createdIso,
    expires_at: expiresIso,
    consumed_at: null,
    revoked_at: null,
  });

  if (error) {
    console.error('[recovery-verification] Failed to persist recovery ticket verifier');
    throw new Error('Failed to create recovery ticket');
  }

  return {
    ticket: ticketSecret,
    expiresInSeconds: Math.floor(expiryMs / 1000),
    expiresAt: expiresIso,
  };
}

/**
 * Safely resolves the client IP under reverse-proxy configurations.
 * Prevents attackers from spoofing IP rate-limiting via arbitrary X-Forwarded-For headers.
 * Under 1 trusted proxy hop (e.g. Cloud Run / ALB / Nginx), the authoritative IP is the last entry.
 */
export function resolveClientIp(
  socketRemoteAddress: string | undefined,
  forwardedForHeader: string | string[] | undefined,
  trustProxyHopCount: number = 1
): string {
  if (!forwardedForHeader || trustProxyHopCount <= 0) {
    let cleanIp = socketRemoteAddress || '127.0.0.1';
    if (cleanIp.startsWith('::ffff:')) cleanIp = cleanIp.substring(7);
    return cleanIp;
  }

  const rawHeader = Array.isArray(forwardedForHeader)
    ? forwardedForHeader.join(',')
    : forwardedForHeader;

  const hops = rawHeader.split(',').map((h) => h.trim()).filter(Boolean);
  if (hops.length === 0) {
    let cleanIp = socketRemoteAddress || '127.0.0.1';
    if (cleanIp.startsWith('::ffff:')) cleanIp = cleanIp.substring(7);
    return cleanIp;
  }

  // Under a reverse proxy deployment (like Cloud Run / GCP LB), exactly trustProxyHopCount proxies are in front.
  // The client IP appended by the trusted edge proxy is at index (length - trustProxyHopCount).
  const targetIndex = Math.max(0, hops.length - trustProxyHopCount);
  let resolvedIp = hops[targetIndex];
  if (resolvedIp.startsWith('::ffff:')) {
    resolvedIp = resolvedIp.substring(7);
  }
  return resolvedIp;
}

/**
 * Validates a recovery ticket (used in Phase 3 for password reset authorization).
 * Checks that the ticket is unconsumed, unrevoked, and unexpired.
 */
export async function validateRecoveryTicket(
  supabaseAdmin: any,
  ticketSecret: string
): Promise<{ valid: boolean; userId?: string; ticketId?: string }> {
  if (!ticketSecret || typeof ticketSecret !== 'string') {
    return { valid: false };
  }

  try {
    const ticketHash = await hashTicketSecret(ticketSecret);
    const { data, error } = await supabaseAdmin
      .from('user_recovery_tickets')
      .select('id, user_id, expires_at, consumed_at, revoked_at')
      .eq('ticket_hash', ticketHash)
      .is('consumed_at', null)
      .is('revoked_at', null)
      .single();

    if (error || !data) {
      return { valid: false };
    }

    const expiresAt = new Date(data.expires_at).getTime();
    if (Date.now() > expiresAt) {
      return { valid: false };
    }

    return { valid: true, userId: data.user_id, ticketId: data.id };
  } catch {
    return { valid: false };
  }
}

/**
 * Consumes a recovery ticket so it cannot be reused (used upon successful password reset).
 */
export async function consumeRecoveryTicket(
  supabaseAdmin: any,
  ticketId: string
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('user_recovery_tickets')
    .update({ consumed_at: nowIso })
    .eq('id', ticketId)
    .is('consumed_at', null)
    .select('id');

  return !error && Boolean(data && data.length > 0);
}

/**
 * Main recovery verification handler.
 * Verifies recovery code, enforces rate limits, consumes code atomically,
 * and issues a restricted recovery authorization ticket.
 */
export async function handleRecoveryVerification(
  supabaseAdmin: any,
  input: {
    identifier?: string;
    code?: string;
    ip?: string;
  }
): Promise<VerificationResult> {
  const { identifier, code, ip = 'unknown-ip' } = input;

  const normalizedIdentifier = (identifier || '').trim().toLowerCase();
  const accountKey = `account:${normalizedIdentifier || 'unknown'}`;
  const ipKey = `ip:${ip}`;

  // 1. Strict rate limiting check
  const ipBlocked = await isRateLimited(supabaseAdmin, ipKey, IP_RATE_LIMIT_MAX);
  const accountBlocked = normalizedIdentifier
    ? await isRateLimited(supabaseAdmin, accountKey, ACCOUNT_RATE_LIMIT_MAX)
    : false;

  if (ipBlocked || accountBlocked) {
    return {
      success: false,
      status: 429,
      body: GENERIC_RATE_LIMIT_ERROR,
    };
  }

  // 2. Validate input format
  const normalizedCode = normalizeRecoveryCode(code || '');
  if (!normalizedIdentifier || !normalizedCode) {
    await recordRateLimitAttempt(supabaseAdmin, ipKey, IP_RATE_LIMIT_MAX);
    if (normalizedIdentifier) {
      await recordRateLimitAttempt(supabaseAdmin, accountKey, ACCOUNT_RATE_LIMIT_MAX);
    }
    return {
      success: false,
      status: 400,
      body: GENERIC_RECOVERY_ERROR,
    };
  }

  // Compute the code hash
  const computedHash = await hashRecoveryCode(normalizedCode);

  // 3. User lookup without account enumeration
  const userId = await findUserIdByIdentifier(supabaseAdmin, normalizedIdentifier);

  if (!userId) {
    // Constant-time dummy computation to mitigate timing attacks
    await hashRecoveryCode('DUMMY-HASH-COMPUTATION-PADDING-1234');
    await recordRateLimitAttempt(supabaseAdmin, ipKey, IP_RATE_LIMIT_MAX);
    await recordRateLimitAttempt(supabaseAdmin, accountKey, ACCOUNT_RATE_LIMIT_MAX);

    return {
      success: false,
      status: 400,
      body: GENERIC_RECOVERY_ERROR,
    };
  }

  // 4. Atomic code consumption
  const consumed = await atomicallyConsumeRecoveryCode(supabaseAdmin, userId, computedHash);

  if (!consumed) {
    // Invalid, already consumed, or revoked code
    await recordRateLimitAttempt(supabaseAdmin, ipKey, IP_RATE_LIMIT_MAX);
    await recordRateLimitAttempt(supabaseAdmin, accountKey, ACCOUNT_RATE_LIMIT_MAX);

    return {
      success: false,
      status: 400,
      body: GENERIC_RECOVERY_ERROR,
    };
  }

  // 5. Successful verification: Reset account rate limit counter
  await resetRateLimit(supabaseAdmin, accountKey);

  // 6. Issue restricted recovery ticket
  const { ticket, expiresAt } = await issueRecoveryTicket(
    supabaseAdmin,
    userId,
    RECOVERY_TICKET_EXPIRY_MS
  );

  return {
    success: true,
    status: 200,
    ticket, // Private to server runtime for cookie issuance; NEVER returned in JSON body
    body: {
      success: true,
      expires_at: expiresAt,
    },
  };
}
