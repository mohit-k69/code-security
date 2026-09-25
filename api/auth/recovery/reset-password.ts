import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const PASSWORD_RESET_RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const GENERIC_RATE_LIMIT_ERROR = {
  error: "TOO_MANY_REQUESTS",
  message: "Too many recovery attempts. Please try again later.",
};

let cachedAdminClient: ReturnType<typeof createClient> | null = null;

function getSupabaseAdmin() {
  if (cachedAdminClient) return cachedAdminClient;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ADMIN_KEY;

  if (url && serviceKey && !url.includes("placeholder")) {
    cachedAdminClient = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedAdminClient;
}

function getCookieValue(
  cookieHeader: string | undefined,
  name: string
): string | undefined {
  if (!cookieHeader) return undefined;

  const parts = cookieHeader.split(";");

  for (const part of parts) {
    const index = part.indexOf("=");

    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return undefined;
}

function resolveClientIp(req: any): string {
  const forwarded = req.headers?.["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    const hops = forwarded
      .split(",")
      .map((value: string) => value.trim())
      .filter(Boolean);

    if (hops.length > 0) {
      return hops[hops.length - 1].replace(/^::ffff:/, "");
    }
  }

  const socketIp = req.socket?.remoteAddress || "127.0.0.1";
  return String(socketIp).replace(/^::ffff:/, "");
}

function hashTicketSecret(ticket: string): string {
  return crypto
    .createHash("sha256")
    .update(ticket.trim(), "utf8")
    .digest("hex");
}

function validateOriginAndCSRF(params: {
  method?: string;
  origin?: string;
  referer?: string;
  secFetchSite?: string;
}): { valid: boolean; reason?: string } {
  const method = (params.method || "POST").toUpperCase();

  if (method !== "POST") {
    return {
      valid: false,
      reason: "METHOD_NOT_ALLOWED",
    };
  }

  const secFetchSite = (params.secFetchSite || "").toLowerCase();

  if (secFetchSite === "cross-site") {
    return {
      valid: false,
      reason: "CROSS_SITE_REQUEST_FORBIDDEN",
    };
  }

  let requestOrigin = params.origin
    ? params.origin.trim().toLowerCase()
    : "";

  if (!requestOrigin && params.referer) {
    try {
      requestOrigin = new URL(params.referer).origin.toLowerCase();
    } catch {
      return {
        valid: false,
        reason: "INVALID_REFERER_HEADER",
      };
    }
  }

  if (!requestOrigin) {
    return {
      valid: false,
      reason: "MISSING_ORIGIN_AND_REFERER",
    };
  }

  const trustedOrigins = new Set<string>();

  const envOriginNames = [
    "APP_URL",
    "VITE_APP_URL",
    "SITE_URL",
    "PUBLIC_URL",
  ];

  for (const name of envOriginNames) {
    const value = process.env[name];

    if (value) {
      trustedOrigins.add(
        value.toLowerCase().replace(/\/$/, "")
      );
    }
  }

  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(",").forEach((origin) => {
      const normalized = origin
        .trim()
        .toLowerCase()
        .replace(/\/$/, "");

      if (normalized && normalized !== "*") {
        trustedOrigins.add(normalized);
      }
    });
  }

  trustedOrigins.add("http://localhost:3000");
  trustedOrigins.add("http://127.0.0.1:3000");
  trustedOrigins.add("http://localhost:5173");
  trustedOrigins.add("http://127.0.0.1:5173");

  if (trustedOrigins.has(requestOrigin)) {
    return { valid: true };
  }

  const isLocalhost =
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(
      requestOrigin
    );

  if (process.env.NODE_ENV !== "production" && isLocalhost) {
    return { valid: true };
  }

  const isRunApp =
    /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/.test(
      requestOrigin
    );

  if (isRunApp) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: "ORIGIN_MISMATCH",
  };
}

async function isRateLimited(
  supabaseAdmin: any,
  key: string,
  maxAttempts: number
): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("recovery_rate_limits")
      .select("*")
      .eq("rate_key", key)
      .single();

    if (!data) return false;

    const now = Date.now();

    const blockedUntil = data.blocked_until
      ? new Date(data.blocked_until).getTime()
      : 0;

    if (blockedUntil > now) {
      return true;
    }

    const firstAttempt = new Date(
      data.first_attempt_at
    ).getTime();

    return (
      now - firstAttempt < RATE_LIMIT_WINDOW_MS &&
      data.attempts >= maxAttempts
    );
  } catch {
    return false;
  }
}

async function recordRateLimitAttempt(
  supabaseAdmin: any,
  key: string,
  maxAttempts: number
): Promise<void> {
  if (!supabaseAdmin) return;

  try {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const { data } = await supabaseAdmin
      .from("recovery_rate_limits")
      .select("*")
      .eq("rate_key", key)
      .single();

    if (!data) {
      await supabaseAdmin
        .from("recovery_rate_limits")
        .insert({
          rate_key: key,
          attempts: 1,
          first_attempt_at: nowIso,
          last_attempt_at: nowIso,
          blocked_until: null,
        });

      return;
    }

    const firstAttempt = new Date(
      data.first_attempt_at
    ).getTime();

    if (now - firstAttempt >= RATE_LIMIT_WINDOW_MS) {
      await supabaseAdmin
        .from("recovery_rate_limits")
        .update({
          attempts: 1,
          first_attempt_at: nowIso,
          last_attempt_at: nowIso,
          blocked_until: null,
        })
        .eq("rate_key", key);

      return;
    }

    const newAttempts = data.attempts + 1;

    const blockedUntil =
      newAttempts >= maxAttempts
        ? new Date(
            now + RATE_LIMIT_WINDOW_MS
          ).toISOString()
        : null;

    await supabaseAdmin
      .from("recovery_rate_limits")
      .update({
        attempts: newAttempts,
        last_attempt_at: nowIso,
        blocked_until: blockedUntil,
      })
      .eq("rate_key", key);
  } catch {
    // Intentionally suppress internal rate-limit failures.
  }
}

async function resetRateLimit(
  supabaseAdmin: any,
  key: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from("recovery_rate_limits")
      .delete()
      .eq("rate_key", key);
  } catch {
    // Non-fatal.
  }
}

async function atomicallyClaimRecoveryTicket(
  supabaseAdmin: any,
  ticketHash: string,
  leaseSeconds = 30
): Promise<{
  success: boolean;
  userId?: string;
  ticketId?: string;
  claimId?: string;
  alreadyUpdated?: boolean;
}> {
  try {
    const { data, error } = await supabaseAdmin.rpc(
      "claim_recovery_ticket_atomic",
      {
        p_ticket_hash: ticketHash,
        p_lease_seconds: leaseSeconds,
      }
    );

    if (!error && Array.isArray(data) && data.length > 0) {
      return {
        success: true,
        userId: data[0].user_id,
        ticketId: data[0].ticket_id || data[0].id,
        claimId: data[0].claim_id,
        alreadyUpdated: Boolean(
          data[0].already_updated
        ),
      };
    }

    if (!error && data?.user_id) {
      return {
        success: true,
        userId: data.user_id,
        ticketId: data.ticket_id || data.id,
        claimId: data.claim_id,
        alreadyUpdated: Boolean(
          data.already_updated
        ),
      };
    }

    if (
      !error &&
      Array.isArray(data) &&
      data.length === 0
    ) {
      return { success: false };
    }
  } catch {
    // Fall through to conditional update.
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const claimExpiresIso = new Date(
    now.getTime() + leaseSeconds * 1000
  ).toISOString();
  const claimId = crypto.randomUUID();

  const { data, error } = await supabaseAdmin
    .from("user_recovery_tickets")
    .update({
      claimed_at: nowIso,
      claim_expires_at: claimExpiresIso,
      claim_id: claimId,
    })
    .eq("ticket_hash", ticketHash)
    .is("consumed_at", null)
    .is("revoked_at", null)
    .is("ambiguous_at", null)
    .gt("expires_at", nowIso)
    .select(
      "id, user_id, password_updated_at"
    );

  if (error || !data || data.length === 0) {
    return { success: false };
  }

  return {
    success: true,
    userId: data[0].user_id,
    ticketId: data[0].id,
    claimId,
    alreadyUpdated: Boolean(
      data[0].password_updated_at
    ),
  };
}

async function releaseRecoveryTicketClaim(
  supabaseAdmin: any,
  ticketId: string,
  claimId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc(
      "release_recovery_ticket_claim",
      {
        p_ticket_id: ticketId,
        p_claim_id: claimId,
      }
    );

    if (!error && typeof data === "boolean") {
      return data;
    }
  } catch {
    // Fall through.
  }

  const { data, error } = await supabaseAdmin
    .from("user_recovery_tickets")
    .update({
      claimed_at: null,
      claim_expires_at: null,
      claim_id: null,
    })
    .eq("id", ticketId)
    .eq("claim_id", claimId)
    .is("consumed_at", null)
    .is("password_updated_at", null)
    .is("ambiguous_at", null)
    .select("id");

  return (
    !error &&
    Array.isArray(data) &&
    data.length > 0
  );
}

async function markRecoveryTicketAmbiguous(
  supabaseAdmin: any,
  ticketId: string,
  claimId: string
): Promise<boolean> {
  const nowIso = new Date().toISOString();

  try {
    const { data, error } = await supabaseAdmin.rpc(
      "mark_recovery_ticket_ambiguous",
      {
        p_ticket_id: ticketId,
        p_claim_id: claimId,
      }
    );

    if (!error && typeof data === "boolean") {
      return data;
    }
  } catch {
    // Fall through.
  }

  const { data, error } = await supabaseAdmin
    .from("user_recovery_tickets")
    .update({
      ambiguous_at: nowIso,
      claim_expires_at: null,
    })
    .eq("id", ticketId)
    .eq("claim_id", claimId)
    .is("consumed_at", null)
    .select("id");

  return (
    !error &&
    Array.isArray(data) &&
    data.length > 0
  );
}

async function recordRecoveryPasswordUpdated(
  supabaseAdmin: any,
  ticketId: string,
  claimId: string
): Promise<boolean> {
  const nowIso = new Date().toISOString();

  try {
    const { data, error } = await supabaseAdmin.rpc(
      "record_recovery_password_updated",
      {
        p_ticket_id: ticketId,
        p_claim_id: claimId,
      }
    );

    if (!error && typeof data === "boolean") {
      return data;
    }
  } catch {
    // Fall through.
  }

  const { data, error } = await supabaseAdmin
    .from("user_recovery_tickets")
    .update({
      password_updated_at: nowIso,
    })
    .eq("id", ticketId)
    .eq("claim_id", claimId)
    .is("consumed_at", null)
    .select("id");

  return (
    !error &&
    Array.isArray(data) &&
    data.length > 0
  );
}

async function finalizeRecoveryTicket(
  supabaseAdmin: any,
  ticketId: string,
  claimId: string
): Promise<boolean> {
  const nowIso = new Date().toISOString();

  try {
    const { data, error } = await supabaseAdmin.rpc(
      "finalize_recovery_ticket_atomic",
      {
        p_ticket_id: ticketId,
        p_claim_id: claimId,
      }
    );

    if (!error && typeof data === "boolean") {
      return data;
    }
  } catch {
    // Fall through.
  }

  const { data, error } = await supabaseAdmin
    .from("user_recovery_tickets")
    .update({
      consumed_at: nowIso,
      claim_expires_at: null,
    })
    .eq("id", ticketId)
    .is("consumed_at", null)
    .select("id");

  return (
    !error &&
    Array.isArray(data) &&
    data.length > 0
  );
}

function isDefinitePreUpdateFailure(err: any): boolean {
  if (!err) return false;

  if (err.status === 400 || err.status === 422) {
    return true;
  }

  if (typeof err.message === "string") {
    const message = err.message.toLowerCase();

    if (
      message.includes("password should be") ||
      message.includes("password is too") ||
      message.includes("weak password") ||
      message.includes("user not found") ||
      message.includes("validation")
    ) {
      return true;
    }
  }

  return false;
}

async function reconcileAmbiguousPasswordUpdate(
  supabaseAdmin: any,
  userId: string,
  newPassword: string
): Promise<"reconciled_success" | "ambiguous_locked"> {
  let tempAccessToken: string | null = null;

  try {
    const {
      data: userData,
      error: userError,
    } = await supabaseAdmin.auth.admin.getUserById(
      userId
    );

    const email = userData?.user?.email;

    if (userError || !email) {
      return "ambiguous_locked";
    }

    const loginProbe =
      await supabaseAdmin.auth.signInWithPassword({
        email,
        password: newPassword,
      });

    if (
      !loginProbe.error &&
      loginProbe.data?.session
    ) {
      tempAccessToken =
        loginProbe.data.session.access_token ||
        null;

      return "reconciled_success";
    }
  } catch {
    // Inconclusive -> fail closed.
  } finally {
    if (tempAccessToken) {
      try {
        if (
          typeof supabaseAdmin.auth?.admin
            ?.signOut === "function"
        ) {
          await supabaseAdmin.auth.admin.signOut(
            tempAccessToken,
            "local"
          );
        } else if (
          typeof supabaseAdmin.auth?.signOut ===
          "function"
        ) {
          await supabaseAdmin.auth.signOut();
        }
      } catch {
        // Non-fatal cleanup.
      }
    }
  }

  return "ambiguous_locked";
}

async function revokeUserSessions(
  supabaseAdmin: any,
  userId: string
): Promise<void> {
  const nowIso = new Date().toISOString();

  try {
    await supabaseAdmin
      .from("user_recovery_tickets")
      .update({
        revoked_at: nowIso,
      })
      .eq("user_id", userId)
      .is("consumed_at", null)
      .is("revoked_at", null);
  } catch {
    // Non-fatal.
  }

  try {
    await supabaseAdmin.rpc(
      "revoke_user_sessions_after_recovery",
      {
        p_user_id: userId,
      }
    );
  } catch {
    // Non-fatal.
  }
}

async function logRecoveryAuditEvent(
  supabaseAdmin: any,
  event: {
    eventType: string;
    userId?: string;
    ticketId?: string;
    ip: string;
  }
): Promise<void> {
  const safeEvent =
    `[audit] event=${event.eventType}` +
    `${event.userId ? ` user_id=${event.userId}` : ""}` +
    `${event.ticketId ? ` ticket_id=${event.ticketId}` : ""}` +
    ` ip=${event.ip}`;

  console.info(safeEvent);

  try {
    await supabaseAdmin
      .from("recovery_audit_logs")
      .insert({
        event_type: event.eventType,
        user_id: event.userId || null,
        ticket_id: event.ticketId || null,
        ip: event.ip,
      });
  } catch {
    // Non-fatal audit persistence.
  }
}

function parseBody(req: any): any {
  if (!req.body) return {};

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

function clearRecoveryCookie(req: any, res: any) {
  const isProduction =
    process.env.NODE_ENV === "production";

  const isSecure =
    isProduction ||
    req.headers?.["x-forwarded-proto"] === "https";

  res.setHeader(
    "Set-Cookie",
    [
      "recovery_ticket=",
      "Path=/api/auth/recovery",
      "HttpOnly",
      ...(isSecure ? ["Secure"] : []),
      "SameSite=Strict",
      "Max-Age=0",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ].join("; ")
  );
}

async function handlePasswordReset(
  admin: any,
  params: {
    ticket?: string;
    newPassword?: string;
    confirmPassword?: string;
    ip?: string;
    origin?: string;
    referer?: string;
    secFetchSite?: string;
  }
) {
  const ip = params.ip || "unknown-ip";
  const ipKey = `reset_ip:${ip}`;

  await logRecoveryAuditEvent(admin, {
    eventType: "recovery_password_reset_started",
    ip,
  });

  const csrfCheck = validateOriginAndCSRF({
    method: "POST",
    origin: params.origin,
    referer: params.referer,
    secFetchSite: params.secFetchSite,
  });

  if (!csrfCheck.valid) {
    await logRecoveryAuditEvent(admin, {
      eventType: "recovery_password_reset_failed",
      ip,
    });

    return {
      success: false,
      status: 403,
      body: {
        error: "CSRF_VALIDATION_FAILED",
        message: "Cross-origin request forbidden.",
      },
      clearCookie: false,
    };
  }

  const isBlocked = await isRateLimited(
    admin,
    ipKey,
    PASSWORD_RESET_RATE_LIMIT_MAX
  );

  if (isBlocked) {
    await logRecoveryAuditEvent(admin, {
      eventType: "recovery_password_reset_failed",
      ip,
    });

    return {
      success: false,
      status: 429,
      body: GENERIC_RATE_LIMIT_ERROR,
      clearCookie: false,
    };
  }

  const ticket = (params.ticket || "").trim();

  if (!ticket || ticket.length !== 64) {
    await recordRateLimitAttempt(
      admin,
      ipKey,
      PASSWORD_RESET_RATE_LIMIT_MAX
    );

    await logRecoveryAuditEvent(admin, {
      eventType: "recovery_password_reset_failed",
      ip,
    });

    return {
      success: false,
      status: 400,
      body: {
        error: "INVALID_RECOVERY_TICKET",
        message: "Invalid or missing recovery ticket.",
      },
      clearCookie: true,
    };
  }

  const newPassword = params.newPassword || "";
  const confirmPassword =
    params.confirmPassword || "";

  if (!newPassword || newPassword.length < 6) {
    await recordRateLimitAttempt(
      admin,
      ipKey,
      PASSWORD_RESET_RATE_LIMIT_MAX
    );

    return {
      success: false,
      status: 400,
      body: {
        error: "INVALID_PASSWORD",
        message:
          "Password must be at least 6 characters.",
      },
      clearCookie: false,
    };
  }

  if (newPassword !== confirmPassword) {
    await recordRateLimitAttempt(
      admin,
      ipKey,
      PASSWORD_RESET_RATE_LIMIT_MAX
    );

    return {
      success: false,
      status: 400,
      body: {
        error: "PASSWORD_CONFIRMATION_MISMATCH",
        message: "Password confirmation does not match.",
      },
      clearCookie: false,
    };
  }

  const ticketHash = hashTicketSecret(ticket);

  const claim = await atomicallyClaimRecoveryTicket(
    admin,
    ticketHash,
    30
  );

  if (
    !claim.success ||
    !claim.userId ||
    !claim.ticketId ||
    !claim.claimId
  ) {
    await recordRateLimitAttempt(
      admin,
      ipKey,
      PASSWORD_RESET_RATE_LIMIT_MAX
    );

    await logRecoveryAuditEvent(admin, {
      eventType: "recovery_password_reset_failed",
      ip,
    });

    return {
      success: false,
      status: 400,
      body: {
        error: "INVALID_RECOVERY_TICKET",
        message:
          "Invalid, expired, or actively claimed recovery session.",
      },
      clearCookie: true,
    };
  }

  const {
    userId,
    ticketId,
    claimId,
    alreadyUpdated,
  } = claim;

  if (alreadyUpdated) {
    await finalizeRecoveryTicket(
      admin,
      ticketId,
      claimId
    );

    try {
      await revokeUserSessions(admin, userId);
    } catch {
      // Non-fatal.
    }

    await resetRateLimit(admin, ipKey);

    await logRecoveryAuditEvent(admin, {
      eventType:
        "recovery_password_reset_succeeded_idempotent",
      userId,
      ticketId,
      ip,
    });

    return {
      success: true,
      status: 200,
      body: {
        success: true,
        message: "Password reset successfully.",
      },
      clearCookie: true,
    };
  }

  let passwordUpdateSucceeded = false;
  let rawUpdateError: any = null;

  try {
    const { error } =
      await admin.auth.admin.updateUserById(
        userId,
        { password: newPassword }
      );

    rawUpdateError = error;

    if (!error) {
      passwordUpdateSucceeded = true;
    }
  } catch (err: any) {
    rawUpdateError = err;
  }

  if (!passwordUpdateSucceeded && rawUpdateError) {
    console.error(
      "[recovery] Supabase auth password update error occurred"
    );

    if (isDefinitePreUpdateFailure(rawUpdateError)) {
      await releaseRecoveryTicketClaim(
        admin,
        ticketId,
        claimId
      );

      await recordRateLimitAttempt(
        admin,
        ipKey,
        PASSWORD_RESET_RATE_LIMIT_MAX
      );

      await logRecoveryAuditEvent(admin, {
        eventType:
          "recovery_password_update_rejected",
        userId,
        ticketId,
        ip,
      });

      return {
        success: false,
        status: 400,
        body: {
          error: "INVALID_PASSWORD",
          message:
            rawUpdateError.message ||
            "Password validation failed.",
        },
        clearCookie: false,
      };
    }

    const reconciliation =
      await reconcileAmbiguousPasswordUpdate(
        admin,
        userId,
        newPassword
      );

    if (reconciliation === "reconciled_success") {
      passwordUpdateSucceeded = true;

      await logRecoveryAuditEvent(admin, {
        eventType:
          "recovery_password_reset_reconciled_succeeded",
        userId,
        ticketId,
        ip,
      });
    } else {
      await markRecoveryTicketAmbiguous(
        admin,
        ticketId,
        claimId
      );

      await recordRateLimitAttempt(
        admin,
        ipKey,
        PASSWORD_RESET_RATE_LIMIT_MAX
      );

      await logRecoveryAuditEvent(admin, {
        eventType:
          "recovery_password_update_ambiguous_locked",
        userId,
        ticketId,
        ip,
      });

      return {
        success: false,
        status: 500,
        body: {
          error: "RECOVERY_TRANSACTION_UNCERTAIN",
          message:
            "Unable to verify password update status due to network uncertainty. For security, this recovery session has been locked. If your password was updated, please log in with your new password. Otherwise, please start a new recovery session using one of your remaining backup recovery codes.",
        },
        clearCookie: true,
      };
    }
  }

  if (!passwordUpdateSucceeded) {
    await markRecoveryTicketAmbiguous(
      admin,
      ticketId,
      claimId
    );

    return {
      success: false,
      status: 500,
      body: {
        error: "RECOVERY_TRANSACTION_UNCERTAIN",
        message:
          "Unable to verify password update status.",
      },
      clearCookie: true,
    };
  }

  await recordRecoveryPasswordUpdated(
    admin,
    ticketId,
    claimId
  );

  await finalizeRecoveryTicket(
    admin,
    ticketId,
    claimId
  );

  await logRecoveryAuditEvent(admin, {
    eventType: "recovery_ticket_consumed",
    userId,
    ticketId,
    ip,
  });

  try {
    await revokeUserSessions(admin, userId);

    await logRecoveryAuditEvent(admin, {
      eventType: "sessions_revoked_after_recovery",
      userId,
      ticketId,
      ip,
    });
  } catch {
    console.error(
      "[recovery] Warning: session revocation error after successful reset"
    );
  }

  await resetRateLimit(admin, ipKey);

  await logRecoveryAuditEvent(admin, {
    eventType:
      "recovery_password_reset_succeeded",
    userId,
    ticketId,
    ip,
  });

  return {
    success: true,
    status: 200,
    body: {
      success: true,
      message: "Password reset successfully.",
    },
    clearCookie: true,
  };
}

export default async function handler(
  req: any,
  res: any
) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({
        error:
          "Method not allowed. POST is required.",
      });
  }

  const admin = getSupabaseAdmin();

  if (!admin) {
    return res
      .status(503)
      .json({
        error: "ADMIN_SERVICE_UNAVAILABLE",
      });
  }

  const ticket = getCookieValue(
    req.headers?.cookie,
    "recovery_ticket"
  );

  const body = parseBody(req);

  const origin =
    typeof req.headers?.origin === "string"
      ? req.headers.origin
      : undefined;

  const referer =
    typeof req.headers?.referer === "string"
      ? req.headers.referer
      : undefined;

  const secFetchSite =
    typeof req.headers?.["sec-fetch-site"] ===
    "string"
      ? req.headers["sec-fetch-site"]
      : undefined;

  const ip = resolveClientIp(req);

  try {
    const result = await handlePasswordReset(
      admin,
      {
        ticket,
        newPassword: body.newPassword,
        confirmPassword: body.confirmPassword,
        ip,
        origin,
        referer,
        secFetchSite,
      }
    );

    if (result.clearCookie) {
      clearRecoveryCookie(req, res);
    }

    return res
      .status(result.status)
      .json(result.body);
  } catch (err: any) {
    console.error(
      "[recovery-reset-password] endpoint error"
    );

    return res
      .status(500)
      .json({
        error: "PASSWORD_RESET_FAILED",
      });
  }
}
