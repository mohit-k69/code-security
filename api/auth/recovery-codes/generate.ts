import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const RECOVERY_CODES_COUNT = 10;
const ENTROPY_BYTES = 20;
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

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
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return cachedAdminClient;
}

function normalizeRecoveryCode(rawCode: string): string {
  return rawCode
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

function generateRecoveryCode(): string {
  const randomBytes = crypto.randomBytes(ENTROPY_BYTES);

  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;
  const chars: string[] = [];

  for (let i = 0; i < 32; i++) {
    while (bitCount < 5) {
      bitBuffer = (bitBuffer << 8) | randomBytes[byteIndex++];
      bitCount += 8;
    }

    const shift = bitCount - 5;
    const index = (bitBuffer >> shift) & 0x1f;

    bitBuffer &= (1 << shift) - 1;
    bitCount -= 5;

    chars.push(CROCKFORD_ALPHABET[index]);
  }

  const chunks: string[] = [];
  for (let i = 0; i < chars.length; i += 4) {
    chunks.push(chars.slice(i, i + 4).join(""));
  }

  return chunks.join("-");
}

function hashRecoveryCode(code: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeRecoveryCode(code), "utf8")
    .digest("hex");
}

function isOAuthOnlyUser(user: any): boolean {
  if (!user) return false;

  const appMeta = user.app_metadata || {};
  const providers: string[] =
    appMeta.providers || (appMeta.provider ? [appMeta.provider] : []);

  const identities: any[] = user.identities || [];

  const hasEmail =
    providers.includes("email") ||
    identities.some((i: any) => i.provider === "email");

  const hasOAuth =
    providers.includes("google") ||
    providers.includes("github") ||
    identities.some(
      (i: any) => i.provider === "google" || i.provider === "github"
    );

  return hasOAuth && !hasEmail;
}

async function getRecoveryCodesStatus(
  supabaseAdmin: any,
  userId: string
) {
  const { data, error } = await supabaseAdmin
    .from("user_recovery_codes")
    .select("created_at")
    .eq("user_id", userId)
    .is("consumed_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Failed to fetch recovery codes status");
  }

  return {
    hasCodes: (data?.length ?? 0) > 0,
    activeCount: data?.length ?? 0,
  };
}

async function verifyCurrentPassword(
  email: string,
  password: string
): Promise<boolean> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey || !email || !password) {
    return false;
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  return !error && Boolean(data?.user);
}

async function generateAndStoreRecoveryCodes(
  supabaseAdmin: any,
  userId: string
): Promise<string[]> {
  const codes: string[] = [];
  const hashes: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < RECOVERY_CODES_COUNT; i++) {
    let code = "";
    let attempts = 0;

    do {
      code = generateRecoveryCode();
      attempts++;

      if (attempts > 50) {
        throw new Error("Failed to generate unique recovery code batch");
      }
    } while (seen.has(code));

    seen.add(code);
    codes.push(code);
    hashes.push(hashRecoveryCode(code));
  }

  const { data, error } = await supabaseAdmin.rpc(
    "replace_user_recovery_codes_atomic",
    {
      p_user_id: userId,
      p_code_hashes: hashes,
    }
  );

  if (error) {
    const errMsg = error.message || "";

    if (
      errMsg.includes("RECOVERY_CODES_REGENERATION_IN_PROGRESS") ||
      (error.code === "P0001" && errMsg.includes("IN_PROGRESS"))
    ) {
      const err: any = new Error(
        "Recovery code generation is already in progress for this account. Please wait a moment."
      );
      err.code = "RECOVERY_CODES_REGENERATION_IN_PROGRESS";
      err.statusCode = 409;
      throw err;
    }

    if (
      errMsg.includes("does not exist") ||
      errMsg.includes("not found") ||
      errMsg === "Unknown RPC function" ||
      error.code === "42883" ||
      error.code === "PGRST202"
    ) {
      const err: any = new Error(
        "Recovery code service is temporarily unavailable"
      );
      err.code = "RECOVERY_CODES_TEMPORARILY_UNAVAILABLE";
      err.statusCode = 503;
      throw err;
    }

    const err: any = new Error(
      "Failed to replace recovery codes atomically."
    );
    err.code = "RECOVERY_CODES_DATABASE_ERROR";
    err.statusCode = 500;
    throw err;
  }

  const record = Array.isArray(data) ? data[0] : data;

  if ((record?.inserted_count ?? RECOVERY_CODES_COUNT) !== RECOVERY_CODES_COUNT) {
    throw new Error("Recovery code persistence returned an unexpected count");
  }

  return codes;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ error: "Method not allowed. POST is required." });
  }

  const authHeader =
    req.headers?.authorization || req.headers?.Authorization;

  if (!authHeader || typeof authHeader !== "string") {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const admin = getSupabaseAdmin();

  if (!admin) {
    return res.status(503).json({ error: "ADMIN_SERVICE_UNAVAILABLE" });
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(token);

    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const status = await getRecoveryCodesStatus(admin, user.id);
    const isRegeneration = status.hasCodes && status.activeCount > 0;

    if (isRegeneration) {
      if (isOAuthOnlyUser(user)) {
        return res.status(403).json({
          error: "OAUTH_REAUTHENTICATION_UNSUPPORTED",
          message:
            "Recovery-code regeneration is currently unavailable for accounts signed in exclusively with Google or GitHub because strong step-up reauthentication is not supported. Please set an account password or contact support.",
        });
      }

      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body || {};

      const currentPassword = body.currentPassword;

      if (
        typeof currentPassword !== "string" ||
        currentPassword.length === 0
      ) {
        return res.status(401).json({
          error: "REAUTHENTICATION_REQUIRED",
          message:
            "Current password reauthentication is required to regenerate recovery codes.",
        });
      }

      const passwordValid = await verifyCurrentPassword(
        user.email,
        currentPassword
      );

      if (!passwordValid) {
        return res.status(401).json({
          error: "INVALID_CREDENTIALS",
          message: "Incorrect current password.",
        });
      }
    }

    const codes = await generateAndStoreRecoveryCodes(admin, user.id);

    return res.status(200).json({
      success: true,
      isInitial: !isRegeneration,
      isRegeneration,
      count: codes.length,
      codes,
    });
  } catch (err: any) {
    if (err?.statusCode && err?.code) {
      return res.status(err.statusCode).json({
        error: err.code,
        message: err.message,
      });
    }

    console.error(
      "[recovery-codes] generation endpoint error:",
      err?.message || err
    );

    return res.status(500).json({
      error: "RECOVERY_CODES_GENERATION_FAILED",
    });
  }
}
