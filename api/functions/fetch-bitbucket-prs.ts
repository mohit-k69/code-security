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

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "No authorization header" });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: "Service unavailable: admin client not configured" });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: connection, error: dbError } = await admin
      .from("oauth_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("provider", "bitbucket")
      .single();

    if (dbError || !connection || !connection.access_token) {
      return res.status(404).json({ error: "Bitbucket connection not found. Please connect your account." });
    }

    const bbToken = connection.access_token;

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const repoFullName = body?.repoFullName || req.query?.repoFullName;
    if (!repoFullName) {
      return res.status(400).json({ error: "Missing repoFullName parameter" });
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
        return res.status(401).json({ error: "Bitbucket connection expired. Please reconnect." });
      }
      return res.status(prsRes.status).json({ error: "Failed to fetch pull requests from Bitbucket." });
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

    return res.status(200).json(mappedPRs);
  } catch (err: any) {
    console.error("[fetch-bitbucket-prs] Internal error:", err?.message || err);
    return res.status(500).json({ error: "Internal server error while fetching Bitbucket pull requests." });
  }
}
