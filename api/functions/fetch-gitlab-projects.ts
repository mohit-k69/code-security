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

    // Fetch the stored GitLab token from oauth_connections
    const { data: connection, error: dbError } = await admin
      .from("oauth_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("provider", "gitlab")
      .single();

    if (dbError || !connection || !connection.access_token) {
      return res.status(404).json({ error: "GitLab connection not found. Please connect your account." });
    }

    const gitlabToken = connection.access_token;

    // Call the GitLab REST API
    const gitlabRes = await fetch(
      "https://gitlab.com/api/v4/projects?membership=true&order_by=updated_at&sort=desc&per_page=100",
      {
        headers: {
          Authorization: `Bearer ${gitlabToken}`,
          Accept: "application/json",
          "User-Agent": "CodeVibe-Vercel-Function",
        },
      }
    );

    if (!gitlabRes.ok) {
      if (gitlabRes.status === 401) {
        return res.status(401).json({ error: "GitLab connection expired. Please reconnect." });
      }
      return res.status(502).json({ error: "Failed to fetch projects from GitLab." });
    }

    const projects = await gitlabRes.json();

    const mapped = projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      path_with_namespace: p.path_with_namespace,
      description: p.description || "",
      default_branch: p.default_branch,
      visibility: p.visibility,
      web_url: p.web_url,
      last_activity_at: p.last_activity_at,
      avatar_url: p.avatar_url || "",
      namespace: {
        name: p.namespace?.name,
        full_path: p.namespace?.full_path,
      },
    }));

    return res.status(200).json(mapped);
  } catch (err: any) {
    console.error("[fetch-gitlab-projects] Internal error:", err?.message || err);
    return res.status(500).json({ error: "Internal server error while fetching GitLab projects." });
  }
}
