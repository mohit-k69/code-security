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

  const clientId = process.env.BITBUCKET_CLIENT_ID || process.env.VITE_BITBUCKET_CLIENT_ID;
  if (!clientId) {
    return sendJson(res, 500, { error: "BITBUCKET_CLIENT_ID not configured" });
  }

  try {
    const { data: stateRecord, error: dbError } = await admin
      .from("oauth_states")
      .insert({
        user_id: user.id,
        provider: "bitbucket",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (dbError || !stateRecord) {
      console.error("[bitbucket-init] Failed to create state:", dbError?.message);
      return sendJson(res, 500, { error: "Failed to initialize OAuth flow" });
    }

    const state = stateRecord.id;
    const bbAuthUrl = new URL("https://bitbucket.org/site/oauth2/authorize");
    bbAuthUrl.searchParams.set("client_id", clientId);
    bbAuthUrl.searchParams.set("response_type", "code");
    
    // Bitbucket redirect URL does not technically require state as a separate query param to be registered if the redirect URI exactly matches,
    // but some apps need exactly matching redirect URI. 
    // We will supply the redirect URI and the state parameter.
    // Bitbucket actually treats redirect_uri strictly.
    // The Bitbucket authorization request MUST use exactly this URL
    bbAuthUrl.searchParams.set("redirect_uri", "https://code-security-review.vercel.app/api/auth/bitbucket/callback");
    bbAuthUrl.searchParams.set("state", state);
    
    // According to Bitbucket OAuth requirements: scope can be requested as space separated string.
    // We need account, repository, pullrequest
    bbAuthUrl.searchParams.set("scope", "account repository pullrequest");

    return sendJson(res, 200, { url: bbAuthUrl.toString() });
  } catch (err: any) {
    console.error("[bitbucket-init] Internal error:", err?.message || err);
    return sendJson(res, 500, { error: "Internal server error" });
  }
}
