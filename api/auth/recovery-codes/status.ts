import { createClient } from "@supabase/supabase-js";

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

async function getRecoveryCodesStatus(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_recovery_codes")
    .select("created_at")
    .eq("user_id", userId)
    .is("consumed_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "[recovery-codes] Database error fetching status:",
      error.message || error
    );
    throw new Error("Failed to fetch recovery codes status");
  }

  const count = data?.length ?? 0;

  return {
    hasCodes: count > 0,
    activeCount: count,
    createdAt:
      count > 0 && data[0]?.created_at ? data[0].created_at : null,
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ error: "Method not allowed. GET is required." });
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
    const isOAuthOnly = isOAuthOnlyUser(user);

    return res.status(200).json({
      success: true,
      ...status,
      isOAuthOnly,
      canRegenerate: !isOAuthOnly,
    });
  } catch (err: any) {
    console.error(
      "[recovery-codes] status endpoint error:",
      err?.message || err
    );

    return res.status(500).json({
      error: "RECOVERY_CODES_STATUS_FAILED",
    });
  }
}
