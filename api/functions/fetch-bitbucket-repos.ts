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
      return res.status(404).json({ error: "Bitbucket is not connected. Please connect your account." });
    }

    const bbToken = connection.access_token;

    const bbRes = await fetch(
      "https://api.bitbucket.org/2.0/repositories?role=contributor&sort=-updated_on&pagelen=100",
      {
        headers: {
          Authorization: `Bearer ${bbToken}`,
          Accept: "application/json",
          "User-Agent": "CodeVibe-Vercel-Function",
        },
      }
    );

    if (!bbRes.ok) {
      if (bbRes.status === 401) {
        return res.status(401).json({ error: "Bitbucket connection expired. Please reconnect." });
      }
      return res.status(bbRes.status).json({ error: "Failed to fetch repositories from Bitbucket." });
    }

    const bbData = await bbRes.json();
    const repos = (bbData.values || []).map((repo: any) => ({
      id: repo.uuid || repo.full_name,
      uuid: repo.uuid,
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner?.nickname || repo.owner?.display_name || repo.workspace?.slug || "",
      workspace: repo.workspace?.slug || repo.workspace?.name || "",
      description: repo.description || "",
      is_private: Boolean(repo.is_private),
      default_branch: repo.mainbranch?.name || "main",
      updated_on: repo.updated_on,
      avatar_url: repo.links?.avatar?.href || "",
      html_url: repo.links?.html?.href || `https://bitbucket.org/${repo.full_name}`,
    }));

    return res.status(200).json(repos);
  } catch (err: any) {
    console.error("[fetch-bitbucket-repos] Internal error:", err?.message || err);
    return res.status(500).json({ error: "Internal server error while fetching Bitbucket repositories." });
  }
}
