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

    // Fetch the stored GitHub token from oauth_connections
    const { data: connection, error: dbError } = await (admin as any)
      .from("oauth_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .eq("provider", "github")
      .single();

    if (dbError || !connection || !(connection as any).access_token) {
      return sendJson(res, 404, { error: "GitHub connection not found. Please connect your account." });
    }

    const githubToken = (connection as any).access_token;

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const owner = body?.owner;
    const repo = body?.repo;

    if (!owner || !repo) {
      return sendJson(res, 400, { error: "Missing owner or repo parameter" });
    }

    // Call the GitHub REST API for pull requests
    const githubRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&sort=updated&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "CodeVibe-Vercel-Function",
        },
      }
    );

    if (!githubRes.ok) {
      if (githubRes.status === 401) {
        return sendJson(res, 401, { error: "GitHub connection expired. Please reconnect." });
      }
      if (githubRes.status === 404) {
        return sendJson(res, 404, { error: "Repository not found or inaccessible." });
      }
      return sendJson(res, 502, { error: "Failed to fetch pull requests from GitHub." });
    }

    const pullRequests = await githubRes.json();

    const mapped = pullRequests.map((pr: any) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      draft: Boolean(pr.draft),
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      html_url: pr.html_url,
      user: {
        login: pr.user?.login,
        avatar_url: pr.user?.avatar_url,
      },
      head: {
        ref: pr.head?.ref,
        sha: pr.head?.sha,
      },
      base: {
        ref: pr.base?.ref,
      },
    }));

    return sendJson(res, 200, mapped);
  } catch (err: any) {
    console.error("[fetch-github-pull-requests] Internal error:", err?.message || err);
    return sendJson(res, 500, { error: "Internal server error while fetching pull requests." });
  }
}
