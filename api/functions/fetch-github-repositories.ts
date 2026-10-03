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

    // Fetch the stored GitHub token from oauth_connections
    const { data: connection, error: dbError } = await admin
      .from("oauth_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("provider", "github")
      .single();

    if (dbError || !connection || !connection.access_token) {
      return res.status(404).json({ error: "GitHub connection not found. Please connect your account." });
    }

    const githubToken = connection.access_token;

    // Call the GitHub REST API
    const githubRes = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "CodeVibe-Vercel-Function",
      },
    });

    if (!githubRes.ok) {
      if (githubRes.status === 401) {
        return res.status(401).json({ error: "GitHub connection expired. Please reconnect." });
      }
      return res.status(502).json({ error: "Failed to fetch repositories from GitHub." });
    }

    const repos = await githubRes.json();

    const mappedRepos = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      description: repo.description,
      default_branch: repo.default_branch,
      language: repo.language,
      updated_at: repo.updated_at,
      owner: {
        login: repo.owner?.login,
        avatar_url: repo.owner?.avatar_url,
      },
    }));

    return res.status(200).json(mappedRepos);
  } catch (err: any) {
    console.error("[fetch-github-repositories] Internal error:", err?.message || err);
    return res.status(500).json({ error: "Internal server error while fetching repositories." });
  }
}
