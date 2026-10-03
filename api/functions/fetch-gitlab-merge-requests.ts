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
      .eq("provider", "gitlab")
      .single();

    if (dbError || !connection || !(connection as any).access_token) {
      return sendJson(res, 404, { error: "GitLab connection not found. Please connect your account." });
    }

    const gitlabToken = (connection as any).access_token;

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const projectId = body?.projectId || req.query?.projectId;
    if (!projectId) {
      return sendJson(res, 400, { error: "Missing projectId parameter" });
    }

    const gitlabUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(String(projectId))}/merge_requests?state=all&order_by=updated_at&sort=desc&per_page=30`;
    const gitlabRes = await fetch(gitlabUrl, {
      headers: {
        Authorization: `Bearer ${gitlabToken}`,
        Accept: "application/json",
        "User-Agent": "CodeVibe-Vercel-Function",
      },
    });

    if (!gitlabRes.ok) {
      if (gitlabRes.status === 401) {
        return sendJson(res, 401, { error: "GitLab connection expired. Please reconnect." });
      }
      if (gitlabRes.status === 404) {
        return sendJson(res, 404, { error: "GitLab project not found or inaccessible." });
      }
      return sendJson(res, gitlabRes.status, { error: "Failed to fetch merge requests from GitLab." });
    }

    const mergeRequests = await gitlabRes.json();
    const mapped = mergeRequests.map((mr: any) => ({
      id: mr.id,
      iid: mr.iid,
      project_id: mr.project_id,
      title: mr.title,
      description: mr.description || "",
      state: mr.state,
      draft: Boolean(mr.draft || mr.work_in_progress),
      created_at: mr.created_at,
      updated_at: mr.updated_at,
      web_url: mr.web_url,
      author: {
        id: mr.author?.id,
        name: mr.author?.name || "Unknown",
        username: mr.author?.username || "unknown",
        avatar_url: mr.author?.avatar_url || "",
      },
      source_branch: mr.source_branch,
      target_branch: mr.target_branch,
      sha: mr.sha || mr.diff_head_sha || "",
    }));

    return sendJson(res, 200, mapped);
  } catch (err: any) {
    console.error("[fetch-gitlab-merge-requests] Internal error:", err?.message || err);
    return sendJson(res, 500, { error: "Internal server error while fetching merge requests." });
  }
}
