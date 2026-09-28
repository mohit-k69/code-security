import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const RECOVERY_TICKET_EXPIRY_MS = 15 * 60 * 1000;
const ACCOUNT_RATE_LIMIT_MAX = 5;
const IP_RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const GENERIC_RECOVERY_ERROR = {
  error: "INVALID_RECOVERY_ATTEMPT",
  message: "Invalid account identifier or recovery code.",
};

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

function normalizeRecoveryCode(rawCode: string): string {
  if (!rawCode || typeof rawCode !== "string") return "";

  return rawCode
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

function hashRecoveryCode(code: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeRecoveryCode(code), "utf8")
    .digest("hex");
}

function generateRecoveryTicketSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashTicketSecret(ticket: string): string {
  return crypto
    .createHash("sha256")
    .update(ticket.trim(), "utf8")
    .digest("hex");
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

    const firstAttempt = new Date(data.first_attempt_at).getTime();

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
      await supabaseAdmin.from("recovery_rate_limits").insert({
        rate_key: key,
        attempts: 1,
        first_attempt_at: nowIso,
        last_attempt_at: nowIso,
        blocked_until: null,
      });
      return;
    }

    const firstAttempt = new Date(data.first_attempt_at).getTime();

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
        ? new Date(now + RATE_LIMIT_WINDOW_MS).toISOString()
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
    // Do not leak internal rate-limit errors.
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
    // Ignore cleanup failure.
  }
}

async function findUserIdByIdentifier(
  supabaseAdmin: any,
  identifier: string
): Promise<string | null> {
  if (!identifier || typeof identifier !== "string") {
    return null;
  }

  const normalized = identifier.trim().toLowerCase();

  try {
    let page = 1;
    const perPage = 100;
    const maxPages = 10;

    while (page <= maxPages) {
      const result = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (result.error || !result.data?.users) {
        break;
      }

      for (const user of result.data.users) {
        if (
          user.email &&
          user.email.trim().toLowerCase() === normalized
        ) {
          return user.id;
        }

        const identities = user.identities || [];

        for (const identity of identities) {
          const identityEmail = identity.identity_data?.email;

          if (
            identityEmail &&
            String(identityEmail).trim().toLowerCase() === normalized
          ) {
            return user.id;
          }
        }

        const metadataEmail = user.user_metadata?.email;

        if (
          metadataEmail &&
          String(metadataEmail).trim().toLowerCase() === normalized
        ) {
          return user.id;
        }
      }

      if (result.data.users.length < perPage) {
        break;
      }

      page++;
    }
  } catch {
    // Suppress lookup failures to avoid account enumeration.
  }

  return null;
}

async function consumeRecoveryCode(
  supabaseAdmin: any,
  userId: string,
  codeHash: string
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc(
      "consume_recovery_code",
      {
        p_user_id: userId,
        p_code_hash: codeHash,
      }
    );

    if (!error && typeof data === "boolean") {
      return data;
    }
  } catch {
    // Fall through to conditional update.
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("user_recovery_codes")
    .update({
      consumed_at: nowIso,
    })
    .eq("user_id", userId)
    .eq("code_hash", codeHash)
    .is("consumed_at", null)
    .is("revoked_at", null)
    .select("id");

  return !error && Boolean(data && data.length > 0);
}

async function issueRecoveryTicket(
  supabaseAdmin: any,
  userId: string
): Promise<{ ticket: string; expiresAt: string }> {
  const ticket = generateRecoveryTicketSecret();
  const ticketHash = hashTicketSecret(ticket);

  const now = Date.now();
  const expiresAt = new Date(
    now + RECOVERY_TICKET_EXPIRY_MS
  ).toISOString();

  const { error } = await supabaseAdmin
    .from("user_recovery_tickets")
    .insert({
      user_id: userId,
      ticket_hash: ticketHash,
      created_at: new Date(now).toISOString(),
      expires_at: expiresAt,
      consumed_at: null,
      revoked_at: null,
    });

  if (error) {
    throw new Error("Failed to create recovery ticket");
  }

  return {
    ticket,
    expiresAt,
  };
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

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
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
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const admin = getSupabaseAdmin();

  if (!admin) {
    return res.status(503).json({
      error: "ADMIN_SERVICE_UNAVAILABLE",
    });
  }

  const body = parseBody(req);

  const identifier = String(
    body.identifier || body.email || ""
  );

  const code = String(body.code || "");

  const normalizedIdentifier = identifier.trim().toLowerCase();

  const ip = resolveClientIp(req);

  const accountKey =
    `account:${normalizedIdentifier || "unknown"}`;

  const ipKey = `ip:${ip}`;

  try {
    const ipBlocked = await isRateLimited(
      admin,
      ipKey,
      IP_RATE_LIMIT_MAX
    );

    const accountBlocked = normalizedIdentifier
      ? await isRateLimited(
          admin,
          accountKey,
          ACCOUNT_RATE_LIMIT_MAX
        )
      : false;

    if (ipBlocked || accountBlocked) {
      return res
        .status(429)
        .json(GENERIC_RATE_LIMIT_ERROR);
    }

    const normalizedCode = normalizeRecoveryCode(code);

    if (!normalizedIdentifier || !normalizedCode) {
      await recordRateLimitAttempt(
        admin,
        ipKey,
        IP_RATE_LIMIT_MAX
      );

      if (normalizedIdentifier) {
        await recordRateLimitAttempt(
          admin,
          accountKey,
          ACCOUNT_RATE_LIMIT_MAX
        );
      }

      return res
        .status(400)
        .json(GENERIC_RECOVERY_ERROR);
    }

    const computedHash = hashRecoveryCode(
      normalizedCode
    );

    const userId = await findUserIdByIdentifier(
      admin,
      normalizedIdentifier
    );

    if (!userId) {
      hashRecoveryCode(
        "DUMMY-HASH-COMPUTATION-PADDING-1234"
      );

      await recordRateLimitAttempt(
        admin,
        ipKey,
        IP_RATE_LIMIT_MAX
      );

      await recordRateLimitAttempt(
        admin,
        accountKey,
        ACCOUNT_RATE_LIMIT_MAX
      );

      return res
        .status(400)
        .json(GENERIC_RECOVERY_ERROR);
    }

    const consumed = await consumeRecoveryCode(
      admin,
      userId,
      computedHash
    );

    if (!consumed) {
      await recordRateLimitAttempt(
        admin,
        ipKey,
        IP_RATE_LIMIT_MAX
      );

      await recordRateLimitAttempt(
        admin,
        accountKey,
        ACCOUNT_RATE_LIMIT_MAX
      );

      return res
        .status(400)
        .json(GENERIC_RECOVERY_ERROR);
    }

    await resetRateLimit(admin, accountKey);

    const { ticket, expiresAt } =
      await issueRecoveryTicket(admin, userId);

    res.setHeader(
      "Set-Cookie",
      [
        `recovery_ticket=${encodeURIComponent(ticket)}`,
        "Path=/api/auth/recovery",
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
        "Max-Age=900",
      ].join("; ")
    );

    return res.status(200).json({
      success: true,
      expires_at: expiresAt,
    });
  } catch (err: any) {
    console.error(
      "[recovery-verification] endpoint error:",
      err?.message || err
    );

    return res.status(500).json({
      error: "RECOVERY_VERIFICATION_FAILED",
    });
  }
}
