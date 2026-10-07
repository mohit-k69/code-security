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

  const clientId = process.env.GITHUB_INTEGRATION_CLIENT_ID;
  if (!clientId) {
    return sendJson(res, 500, { error: "GITHUB_INTEGRATION_CLIENT_ID not configured" });
  }

  try {
    // 1. Determine and validate the initiating origin
    const originHeader = req.headers.origin || req.headers.referer || "";
    let validatedOrigin = "https://code-security-review.vercel.app"; // Secure fallback

    if (originHeader) {
      try {
        const url = new URL(originHeader);
        const origin = url.origin;
        
        // Strict allowlist validation
        const isLocal = origin === "http://localhost:5173" || origin === "http://localhost:4173";
        const isProduction = origin === "https://code-security-review.vercel.app";
        const isPreview = /^https:\/\/code-security[a-zA-Z0-9-]*\.vercel\.app$/.test(origin);
        
        if (isLocal || isProduction || isPreview) {
          validatedOrigin = origin;
        } else {
          console.warn(`[github-init] Unapproved origin rejected: ${origin}`);
        }
      } catch (e) {
        console.warn(`[github-init] Failed to parse origin: ${originHeader}`);
      }
    }

    // We rely on the gen_random_uuid() default in the database for the state
    // We just insert the user_id, origin, and return state to get the generated UUID
    const { data: stateRecord, error: dbError } = await admin
      .from("oauth_states")
      .insert({
        user_id: user.id,
        provider: "github",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 mins
        origin: validatedOrigin
      })
      .select("id")
      .single();

    if (dbError || !stateRecord) {
      console.error("[github-init] Failed to create state:", dbError?.message);
      return sendJson(res, 500, { error: "Failed to initialize OAuth flow" });
    }

    const state = stateRecord.id;
    // We assume Vercel routes or production URL is configured, but redirect_uri is optional if configured properly in GitHub App.
    // If not, we might need process.env.PUBLIC_SITE_URL. We'll let GitHub use the registered callback.
    const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
    githubAuthUrl.searchParams.set("client_id", clientId);
    githubAuthUrl.searchParams.set("scope", "repo");
    githubAuthUrl.searchParams.set("state", state);
    
    // Optional: if we want to force redirect_uri, we'd need the base URL.
    // Generally relying on GitHub App config is safer.

    return sendJson(res, 200, { url: githubAuthUrl.toString() });
  } catch (err: any) {
    console.error("[github-init] Internal error:", err?.message || err);
    return sendJson(res, 500, { error: "Internal server error" });
  }
}
