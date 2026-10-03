import { createClient } from "@supabase/supabase-js";

let cachedAdminClient: any = null;

function getSupabaseAdmin(): any {
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
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
      return sendJson(res, 401, { error: "No authorization header" });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return sendJson(res, 503, { error: "Service unavailable: admin client not configured" });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }

    const { data: connection, error: dbError } = await (admin as any)
      .from("oauth_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("provider", "bitbucket")
      .single();

    if (dbError || !connection || !(connection as any).access_token) {
      return sendJson(res, 404, { error: "Bitbucket connection not found. Please connect your account." });
    }

    const bbToken = (connection as any).access_token;

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const repoFullName = body?.repoFullName || req.query?.repoFullName;
    if (!repoFullName) {
      return sendJson(res, 400, { error: "Missing repoFullName parameter" });
    }

    const prsRes = await fetch(
      `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(String(repoFullName))}/pullrequests?state=OPEN&pagelen=30`,
      {
        headers: {
          Authorization: `Bearer ${bbToken}`,
          Accept: "application/json",
          "User-Agent": "CodeVibe-Vercel-Function",
        },
      }
    );

    if (!prsRes.ok) {
      if (prsRes.status === 401) {
        return sendJson(res, 401, { error: "Bitbucket connection expired. Please reconnect." });
      }
      return sendJson(res, prsRes.status, { error: "Failed to fetch pull requests from Bitbucket." });
    }

    const prsData = await prsRes.json();
    const mappedPRs = (prsData.values || []).map((pr: any) => ({
      id: pr.id,
      number: pr.id,
      title: pr.title,
      description: pr.description || "",
      state: pr.state?.toLowerCase() || "open",
      created_at: pr.created_on,
      updated_at: pr.updated_on,
      html_url: pr.links?.html?.href || "",
      author: {
        name: pr.author?.display_name || pr.author?.nickname || "Unknown",
        username: pr.author?.username || pr.author?.nickname || "unknown",
        avatar_url: pr.author?.links?.avatar?.href || "",
      },
      source_branch: pr.source?.branch?.name || "",
      target_branch: pr.destination?.branch?.name || "",
      sha: pr.source?.commit?.hash || "",
    }));

    return sendJson(res, 200, mappedPRs);
  } catch (err: any) {
    console.error("[fetch-bitbucket-prs] Internal error:", err?.message || err);
    return sendJson(res, 500, { error: "Internal server error while fetching Bitbucket pull requests." });
  }
}
