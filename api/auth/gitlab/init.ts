import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ADMIN_KEY;

  if (url && serviceKey && !url.includes("placeholder")) {
    return createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return null;
}

function sendJson(res: any, status: number, body: any) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  if (typeof res.json === "function") {
    return res.json(body);
  }
  return res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) {
    return sendJson(res, 401, { error: "No authorization header" });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return sendJson(res, 503, { error: "Admin client not configured" });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  
  if (userError || !user) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }

  const clientId = process.env.GITLAB_CLIENT_ID || process.env.VITE_GITLAB_CLIENT_ID;
  if (!clientId) {
    return sendJson(res, 500, { error: "GITLAB_CLIENT_ID not configured" });
  }

  try {
    const { data: stateRecord, error: dbError } = await admin
      .from("oauth_states")
      .insert({
        user_id: user.id,
        provider: "gitlab",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (dbError || !stateRecord) {
      console.error("[gitlab-init] Failed to create state:", dbError?.message);
      return sendJson(res, 500, { error: "Failed to initialize OAuth flow" });
    }

    const state = stateRecord.id;
    const gitlabAuthUrl = new URL("https://gitlab.com/oauth/authorize");
    gitlabAuthUrl.searchParams.set("client_id", clientId);
    gitlabAuthUrl.searchParams.set("response_type", "code");
    
    const origin = req.headers.origin || process.env.PUBLIC_SITE_URL || `https://${req.headers.host || "localhost:5173"}`;
    gitlabAuthUrl.searchParams.set("redirect_uri", `${origin}/api/auth/gitlab/callback`);
    gitlabAuthUrl.searchParams.set("state", state);
    gitlabAuthUrl.searchParams.set("scope", "read_user read_api read_repository");

    return sendJson(res, 200, { url: gitlabAuthUrl.toString() });
  } catch (err: any) {
    console.error("[gitlab-init] Internal error:", err?.message || err);
    return sendJson(res, 500, { error: "Internal server error" });
  }
}
