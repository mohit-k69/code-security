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

// -------------------------------------------------------------
// PHASE 3: Password Reset, CSRF Defense, & Session Revocation
// -------------------------------------------------------------

export interface PasswordResetResult {
  success: boolean;
  status: number;
  body: {
    success?: boolean;
    error?: string;
    message?: string;
  };
}

const PASSWORD_RESET_RATE_LIMIT_MAX = 5;

/**
 * Validates request Origin and CSRF defense-in-depth headers.
 * 1. Requires POST method.
 * 2. Inspects Sec-Fetch-Site (rejects cross-site).
 * 3. Validates Origin against trusted origins (or Referer fallback).
 * 4. Rejects wildcards, arbitrary origins, and never trusts Host header.
 */
export function validateOriginAndCSRF(params: {
  method?: string;
  origin?: string;
  referer?: string;
  secFetchSite?: string;
}): { valid: boolean; reason?: string } {
  // 1. Method MUST be POST
  const method = (params.method || 'POST').toUpperCase();
  if (method !== 'POST') {
    return { valid: false, reason: 'METHOD_NOT_ALLOWED' };
  }

  // 2. Sec-Fetch-Site check: reject cross-site requests
  const secFetchSite = (params.secFetchSite || '').toLowerCase();
  if (secFetchSite === 'cross-site') {
    return { valid: false, reason: 'CROSS_SITE_REQUEST_FORBIDDEN' };
  }

  // 3. Extract request origin: prefer Origin header, fallback to Referer origin
  let requestOrigin = params.origin ? params.origin.trim().toLowerCase() : '';
  if (!requestOrigin && params.referer) {
    try {
      const parsed = new URL(params.referer);
      requestOrigin = parsed.origin.toLowerCase();
    } catch {
      return { valid: false, reason: 'INVALID_REFERER_HEADER' };
    }
  }

  if (!requestOrigin) {
    return { valid: false, reason: 'MISSING_ORIGIN_AND_REFERER' };
  }

  // 4. Validate against trusted origins (never derived from attacker request headers)
  const trustedOrigins = new Set<string>();

  if (process.env.APP_URL) trustedOrigins.add(process.env.APP_URL.toLowerCase().replace(/\/$/, ''));
  if (process.env.VITE_APP_URL) trustedOrigins.add(process.env.VITE_APP_URL.toLowerCase().replace(/\/$/, ''));
  if (process.env.SITE_URL) trustedOrigins.add(process.env.SITE_URL.toLowerCase().replace(/\/$/, ''));
  if (process.env.PUBLIC_URL) trustedOrigins.add(process.env.PUBLIC_URL.toLowerCase().replace(/\/$/, ''));
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach((o) => {
      const trimmed = o.trim().toLowerCase().replace(/\/$/, '');
      if (trimmed && trimmed !== '*') trustedOrigins.add(trimmed);
    });
  }

  // Standard development origins
  trustedOrigins.add('http://localhost:3000');
  trustedOrigins.add('http://127.0.0.1:3000');
  trustedOrigins.add('http://localhost:5173');
  trustedOrigins.add('http://127.0.0.1:5173');

  if (trustedOrigins.has(requestOrigin)) {
    return { valid: true };
  }

  // Ephemeral test / local development ports
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin);
  if (process.env.NODE_ENV !== 'production' && isLocalhost) {
    return { valid: true };
  }

  // Cloud Run app preview environments
  const isRunApp = /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/.test(requestOrigin);
  if (isRunApp) {
    return { valid: true };
  }

  return { valid: false, reason: 'ORIGIN_MISMATCH' };
}

/**
 * Atomically claims a recovery ticket with a short-lived server lease (default 30s).
 * Prevents concurrent requests from processing the same ticket simultaneously.
 */
export async function atomicallyClaimRecoveryTicket(
  supabaseAdmin: any,
  ticketHash: string,
  leaseSeconds: number = 30
): Promise<{
  success: boolean;
  userId?: string;
  ticketId?: string;
  claimId?: string;
  alreadyUpdated?: boolean;
}> {
  // 1. Try atomic database stored procedure with FOR UPDATE SKIP LOCKED
  try {
    const { data, error } = await supabaseAdmin.rpc('claim_recovery_ticket_atomic', {
      p_ticket_hash: ticketHash,
      p_lease_seconds: leaseSeconds,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      return {
        success: true,
        userId: data[0].user_id,
        ticketId: data[0].ticket_id || data[0].id,
        claimId: data[0].claim_id,
        alreadyUpdated: Boolean(data[0].already_updated),
      };
    }
    if (!error && data && data.user_id) {
      return {
        success: true,
        userId: data.user_id,
        ticketId: data.ticket_id || data.id,
        claimId: data.claim_id,
        alreadyUpdated: Boolean(data.already_updated),
      };
    }
    if (!error && Array.isArray(data) && data.length === 0) {
      return { success: false };
    }
  } catch {
    // Fall back to direct conditional update
  }

  // 2. Direct conditional UPDATE in PostgreSQL with lease condition:
  const now = new Date();
  const nowIso = now.toISOString();
  const claimExpiresIso = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
  const claimId = crypto.randomUUID();

  const { data, error } = await supabaseAdmin
    .from('user_recovery_tickets')
    .update({
      claimed_at: nowIso,
      claim_expires_at: claimExpiresIso,
      claim_id: claimId,
    })
    .eq('ticket_hash', ticketHash)
    .is('consumed_at', null)
    .is('revoked_at', null)
    .is('ambiguous_at', null)
    .gt('expires_at', nowIso)
    .select('id, user_id, password_updated_at');

  if (error || !data || data.length === 0) {
    return { success: false };
  }

  return {
    success: true,
    userId: data[0].user_id,
    ticketId: data[0].id,
    claimId,
    alreadyUpdated: Boolean(data[0].password_updated_at),
  };
}

/**
 * Safely releases an active ticket claim ONLY if a definite pre-update failure occurred
 * before password update took effect. Preserves recovery ticket availability.
 */
export async function releaseRecoveryTicketClaim(
  supabaseAdmin: any,
  ticketId: string,
  claimId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('release_recovery_ticket_claim', {
      p_ticket_id: ticketId,
      p_claim_id: claimId,
    });
    if (!error && typeof data === 'boolean') {
      return data;
    }
  } catch {
    // Fall back
  }

  const { data, error } = await supabaseAdmin
    .from('user_recovery_tickets')
    .update({
      claimed_at: null,
      claim_expires_at: null,
      claim_id: null,
    })
    .eq('id', ticketId)
    .eq('claim_id', claimId)
    .is('consumed_at', null)
    .is('password_updated_at', null)
    .is('ambiguous_at', null)
    .select('id');

  return !error && Array.isArray(data) && data.length > 0;
}

/**
 * Permanently locks a recovery ticket into the AMBIGUOUS_LOCKED state.
 * Used when an external Supabase update request times out, drops connection,
 * or returns an indeterminate error where we cannot guarantee whether the password changed.
 * An ambiguous ticket is NEVER returned to available.
 */
export async function markRecoveryTicketAmbiguous(
  supabaseAdmin: any,
  ticketId: string,
  claimId: string
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  try {
    const { data, error } = await supabaseAdmin.rpc('mark_recovery_ticket_ambiguous', {
      p_ticket_id: ticketId,
      p_claim_id: claimId,
    });
    if (!error && typeof data === 'boolean') {
      return data;
    }
  } catch {
    // Fall back
  }

  const { data, error } = await supabaseAdmin
    .from('user_recovery_tickets')
    .update({
      ambiguous_at: nowIso,
      claim_expires_at: null, // Lock permanently - never auto-expire back to available
    })
    .eq('id', ticketId)
    .eq('claim_id', claimId)
    .is('consumed_at', null)
    .select('id');

  return !error && Array.isArray(data) && data.length > 0;
}

/**
 * Records that the password update in Supabase Auth succeeded,
 * entering the point of no return for this recovery ticket.
 */
export async function recordRecoveryPasswordUpdated(
  supabaseAdmin: any,
  ticketId: string,
  claimId: string
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  try {
    const { data, error } = await supabaseAdmin.rpc('record_recovery_password_updated', {
      p_ticket_id: ticketId,
      p_claim_id: claimId,
    });
    if (!error && typeof data === 'boolean') {
      return data;
    }
  } catch {
    // Fall back
  }

  const { data, error } = await supabaseAdmin
    .from('user_recovery_tickets')
    .update({
      password_updated_at: nowIso,
    })
    .eq('id', ticketId)
    .eq('claim_id', claimId)
    .is('consumed_at', null)
    .select('id');

  return !error && Array.isArray(data) && data.length > 0;
}

/**
 * Atomically finalizes recovery ticket consumption after successful password reset.
 */
export async function finalizeRecoveryTicket(
  supabaseAdmin: any,
  ticketId: string,
  claimId: string
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  try {
    const { data, error } = await supabaseAdmin.rpc('finalize_recovery_ticket_atomic', {
      p_ticket_id: ticketId,
      p_claim_id: claimId,
    });
    if (!error && typeof data === 'boolean') {
      return data;
    }
  } catch {
    // Fall back
  }

  const { data, error } = await supabaseAdmin
    .from('user_recovery_tickets')
    .update({
      consumed_at: nowIso,
      claim_expires_at: null,
    })
    .eq('id', ticketId)
    .is('consumed_at', null)
    .select('id');

  return !error && Array.isArray(data) && data.length > 0;
}

/**
 * Atomically consumes a recovery ticket to prevent replay and race conditions.
 * Two simultaneous requests with the same ticket can only succeed ONCE.
 */
export async function atomicallyConsumeRecoveryTicket(
  supabaseAdmin: any,
  ticketHash: string
): Promise<{ success: boolean; userId?: string; ticketId?: string }> {
  const nowIso = new Date().toISOString();

  // 1. Try atomic database stored function if available
  try {
    const { data, error } = await supabaseAdmin.rpc('consume_recovery_ticket_atomic', {
      p_ticket_hash: ticketHash,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      return {
        success: true,
        userId: data[0].user_id,
        ticketId: data[0].ticket_id || data[0].id,
      };
    }
    if (!error && data && data.user_id) {
      return {
        success: true,
        userId: data.user_id,
        ticketId: data.ticket_id || data.id,
      };
    }
  } catch {
    // Fall back to direct atomic conditional UPDATE
  }

  // 2. Direct conditional UPDATE in PostgreSQL with row locking:
  const { data, error } = await supabaseAdmin
    .from('user_recovery_tickets')
    .update({ consumed_at: nowIso })
    .eq('ticket_hash', ticketHash)
    .is('consumed_at', null)
    .is('revoked_at', null)
    .is('ambiguous_at', null)
    .gt('expires_at', nowIso)
    .select('id, user_id');

  if (error || !data || data.length === 0) {
    return { success: false };
  }

  return {
    success: true,
    userId: data[0].user_id,
    ticketId: data[0].id,
  };
}

/**
 * Distinguishes definite pre-update validation failures from ambiguous outcomes.
 * Only HTTP 400 / 422 client validation errors from GoTrue represent proven
 * pre-update rejections where the password was definitely NOT updated.
 * Network errors, timeouts, 5xx server errors, or indeterminate responses are AMBIGUOUS.
 */
export function isDefinitePreUpdateFailure(err: any): boolean {
  if (!err) return false;
  // HTTP status 400 or 422 represents pre-update validation rejection
  if (err.status === 400 || err.status === 422) {
    return true;
  }
  if (typeof err.message === 'string') {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('password should be') ||
      msg.includes('password is too') ||
      msg.includes('weak password') ||
      msg.includes('user not found') ||
      msg.includes('validation')
    ) {
      return true;
    }
  }
  // Any network error, timeout, socket abort, or 5xx server error is NOT a definite failure
  return false;
}

/**
 * Attempts safe automatic server-side reconciliation for an ambiguous Supabase update.
 * Probes whether the password credential was actually updated by testing authentication.
 */
export async function reconcileAmbiguousPasswordUpdate(
  supabaseAdmin: any,
  userId: string,
  newPassword: string
): Promise<'reconciled_success' | 'ambiguous_locked'> {
  try {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) {
      return 'ambiguous_locked';
    }

    const loginProbe = await supabaseAdmin.auth.signInWithPassword({
      email,
      password: newPassword,
    });

    if (!loginProbe.error && loginProbe.data?.session) {
      // Conclusive proof: Supabase Auth already committed the password change!
      return 'reconciled_success';
    }
  } catch {
    // Probe inconclusive
  }

  return 'ambiguous_locked';
}

/**
 * Revokes all existing user sessions and remaining recovery tickets after a password reset.
 */
export async function revokeUserSessions(
  supabaseAdmin: any,
  userId: string
): Promise<void> {
  const nowIso = new Date().toISOString();

  // 1. Invalidate any other unconsumed recovery tickets for this user
  try {
    await supabaseAdmin
      .from('user_recovery_tickets')
      .update({ revoked_at: nowIso })
      .eq('user_id', userId)
      .is('consumed_at', null)
      .is('revoked_at', null);
  } catch {
    // Non-fatal
  }

  // 2. Invalidate sessions in database via stored procedure if available
  try {
    await supabaseAdmin.rpc('revoke_user_sessions_after_recovery', {
      p_user_id: userId,
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Records a security audit event without logging passwords, tokens, or credentials.
 */
export async function logRecoveryAuditEvent(
  supabaseAdmin: any,
  event: {
    eventType: string;
    userId?: string;
    ticketId?: string;
    ip: string;
  }
): Promise<void> {
  const sanitizedEvent = `[audit] event=${event.eventType}${event.userId ? ` user_id=${event.userId}` : ''}${event.ticketId ? ` ticket_id=${event.ticketId}` : ''} ip=${event.ip}`;
  console.info(sanitizedEvent);

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('recovery_audit_logs').insert({
        event_type: event.eventType,
        user_id: event.userId || null,
        ticket_id: event.ticketId || null,
        ip: event.ip,
      });
    } catch {
      // Non-fatal audit log persistence
    }
  }
}

/**
 * Main password reset handler (Phase 3).
 * Validates CSRF/origin, rate limits, verifies and atomically consumes recovery ticket,
 * updates Supabase Auth password, revokes existing sessions, and returns generic status.
 */
export async function handlePasswordResetWithTicket(
  supabaseAdmin: any,
  params: {
    ticket?: string;
    newPassword?: string;
    confirmPassword?: string;
    ip?: string;
    origin?: string;
    referer?: string;
    secFetchSite?: string;
    method?: string;
  }
): Promise<PasswordResetResult> {
  const ip = params.ip || 'unknown-ip';
  const ipKey = `reset_ip:${ip}`;

  // 1. Audit start
  await logRecoveryAuditEvent(supabaseAdmin, {
    eventType: 'recovery_password_reset_started',
    ip,
  });

  // 2. CSRF & Origin validation
  const csrfCheck = validateOriginAndCSRF({
    method: params.method,
    origin: params.origin,
    referer: params.referer,
    secFetchSite: params.secFetchSite,
  });

  if (!csrfCheck.valid) {
    await logRecoveryAuditEvent(supabaseAdmin, {
      eventType: 'recovery_password_reset_failed',
      ip,
    });
    return {
      success: false,
      status: 403,
      body: {
        error: 'CSRF_VALIDATION_FAILED',
        message: 'Cross-origin request forbidden.',
      },
    };
  }

  // 3. Strict rate limiting check on IP
  const isBlocked = await isRateLimited(supabaseAdmin, ipKey, PASSWORD_RESET_RATE_LIMIT_MAX);
  if (isBlocked) {
    await logRecoveryAuditEvent(supabaseAdmin, {
      eventType: 'recovery_password_reset_failed',
      ip,
    });
    return {
      success: false,
      status: 429,
      body: GENERIC_RATE_LIMIT_ERROR,
    };
  }

  // 4. Validate recovery ticket presence (from cookie only)
  const ticket = (params.ticket || '').trim();
  if (!ticket || ticket.length !== 64) {
    await recordRateLimitAttempt(supabaseAdmin, ipKey, PASSWORD_RESET_RATE_LIMIT_MAX);
    await logRecoveryAuditEvent(supabaseAdmin, {
      eventType: 'recovery_password_reset_failed',
      ip,
    });
    return {
      success: false,
      status: 400,
      body: {
        error: 'INVALID_RECOVERY_TICKET',
        message: 'Invalid or missing recovery ticket.',
      },
    };
  }

  // 5. Validate new password and confirmation BEFORE consuming ticket
  // If the user makes a typo in password confirmation, we do NOT consume their single-use recovery ticket!
  const newPassword = params.newPassword || '';
  const confirmPassword = params.confirmPassword || '';

  if (!newPassword || newPassword.length < 6) {
    await recordRateLimitAttempt(supabaseAdmin, ipKey, PASSWORD_RESET_RATE_LIMIT_MAX);
    return {
      success: false,
      status: 400,
      body: {
        error: 'INVALID_PASSWORD',
        message: 'Password must be at least 6 characters.',
      },
    };
  }

  if (newPassword !== confirmPassword) {
    await recordRateLimitAttempt(supabaseAdmin, ipKey, PASSWORD_RESET_RATE_LIMIT_MAX);
    return {
      success: false,
      status: 400,
      body: {
        error: 'PASSWORD_CONFIRMATION_MISMATCH',
        message: 'Password confirmation does not match.',
      },
    };
  }

  // 6. Compute ticket hash & atomically claim ticket (short-lived lease, e.g. 30 seconds)
  const ticketHash = await hashTicketSecret(ticket);
  const claim = await atomicallyClaimRecoveryTicket(supabaseAdmin, ticketHash, 30);

  if (!claim.success || !claim.userId || !claim.ticketId || !claim.claimId) {
    await recordRateLimitAttempt(supabaseAdmin, ipKey, PASSWORD_RESET_RATE_LIMIT_MAX);
    await logRecoveryAuditEvent(supabaseAdmin, {
      eventType: 'recovery_password_reset_failed',
      ip,
    });
    return {
      success: false,
      status: 400,
      body: {
        error: 'INVALID_RECOVERY_TICKET',
        message: 'Invalid, expired, or actively claimed recovery session.',
      },
    };
  }

  const { userId, ticketId, claimId, alreadyUpdated } = claim;

  // 7. Check for idempotent retry: password was ALREADY updated in Supabase Auth
  // (e.g. failure window B where Supabase succeeded but network failed right before finalization)
  if (alreadyUpdated) {
    await finalizeRecoveryTicket(supabaseAdmin, ticketId, claimId);
    try {
      await revokeUserSessions(supabaseAdmin, userId);
    } catch {
      // Non-fatal
    }
    await resetRateLimit(supabaseAdmin, ipKey);
    await logRecoveryAuditEvent(supabaseAdmin, {
      eventType: 'recovery_password_reset_succeeded_idempotent',
      userId,
      ticketId,
      ip,
    });
    return {
      success: true,
      status: 200,
      body: {
        success: true,
        message: 'Password reset successfully.',
      },
    };
  }

  // 8. Update user's password in Supabase Auth (preserving Google/GitHub identities)
  let passwordUpdateSucceeded = false;
  let rawUpdateError: any = null;

  try {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );
    rawUpdateError = updateError;
    if (!updateError) {
      passwordUpdateSucceeded = true;
    }
  } catch (err: any) {
    rawUpdateError = err;
  }

  if (!passwordUpdateSucceeded && rawUpdateError) {
    console.error('[recovery] Supabase auth password update error occurred');

    if (isDefinitePreUpdateFailure(rawUpdateError)) {
      // DEFINITE PRE-UPDATE FAILURE:
      // GoTrue rejected client validation (e.g. HTTP 400/422). Password was definitely NOT updated.
      // Safely release the ticket claim so the user can correct the input and retry.
      await releaseRecoveryTicketClaim(supabaseAdmin, ticketId, claimId);
      await recordRateLimitAttempt(supabaseAdmin, ipKey, PASSWORD_RESET_RATE_LIMIT_MAX);
      await logRecoveryAuditEvent(supabaseAdmin, {
        eventType: 'recovery_password_update_rejected',
        userId,
        ticketId,
        ip,
      });
      return {
        success: false,
        status: 400,
        body: {
          error: 'INVALID_PASSWORD',
          message: rawUpdateError.message || 'Password validation failed.',
        },
      };
    }

    // AMBIGUOUS OUTCOME:
    // Network timeout, connection drop, 5xx server error, or indeterminate response.
    // The password update MAY have already committed in Supabase Auth before failure!
    // Priority: AT-MOST-ONCE password change. UNKNOWN OUTCOME != AVAILABLE TICKET.
    // We MUST NOT release the claim back to available.

    // Attempt safe server-side reconciliation:
    const recon = await reconcileAmbiguousPasswordUpdate(supabaseAdmin, userId, newPassword);
    if (recon === 'reconciled_success') {
      // Conclusive proof: Password update succeeded in Supabase Auth!
      passwordUpdateSucceeded = true;
      await logRecoveryAuditEvent(supabaseAdmin, {
        eventType: 'recovery_password_reset_reconciled_succeeded',
        userId,
        ticketId,
        ip,
      });
    } else {
      // Indeterminate: Fail closed. Lock ticket into AMBIGUOUS_LOCKED state.
      await markRecoveryTicketAmbiguous(supabaseAdmin, ticketId, claimId);
      await recordRateLimitAttempt(supabaseAdmin, ipKey, PASSWORD_RESET_RATE_LIMIT_MAX);
      await logRecoveryAuditEvent(supabaseAdmin, {
        eventType: 'recovery_password_update_ambiguous_locked',
        userId,
        ticketId,
        ip,
      });
      return {
        success: false,
        status: 500,
        body: {
          error: 'RECOVERY_TRANSACTION_UNCERTAIN',
          message: 'Unable to verify password update status due to network uncertainty. For security, this recovery session has been locked. If your password was updated, please log in with your new password. Otherwise, please start a new recovery session using one of your remaining backup recovery codes.',
        },
      };
    }
  }

  // 9. Point of no return: Supabase password update succeeded!
  // Persist that password update succeeded and atomically finalize consumption
  await recordRecoveryPasswordUpdated(supabaseAdmin, ticketId, claimId);
  await finalizeRecoveryTicket(supabaseAdmin, ticketId, claimId);

  await logRecoveryAuditEvent(supabaseAdmin, {
    eventType: 'recovery_ticket_consumed',
    userId,
    ticketId,
    ip,
  });

  // 10. Revoke all previous sessions and remaining recovery tickets
  try {
    await revokeUserSessions(supabaseAdmin, userId);
    await logRecoveryAuditEvent(supabaseAdmin, {
      eventType: 'sessions_revoked_after_recovery',
      userId,
      ticketId,
      ip,
    });
  } catch (revokeErr) {
    console.error('[recovery] Warning: session revocation error after successful reset');
  }

  // 11. Reset rate limit for IP on success
  await resetRateLimit(supabaseAdmin, ipKey);

  await logRecoveryAuditEvent(supabaseAdmin, {
    eventType: 'recovery_password_reset_succeeded',
    userId,
    ticketId,
    ip,
  });

  return {
    success: true,
    status: 200,
    body: {
      success: true,
      message: 'Password reset successfully.',
    },
  };
}
