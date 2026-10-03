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
      .eq("provider", "azure")
      .single();

    if (dbError || !connection || !(connection as any).access_token) {
      return sendJson(res, 404, { error: "Azure DevOps connection not found. Please connect your account." });
    }

    const azureToken = (connection as any).access_token;

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const { organization, project, repositoryId } = body || {};
    if (!organization || !repositoryId) {
      return sendJson(res, 400, { error: "Missing organization or repositoryId parameter" });
    }

    const prsUrl = `https://dev.azure.com/${organization}/${project ? project + "/" : ""}_apis/git/repositories/${repositoryId}/pullrequests?searchCriteria.status=active&api-version=6.0`;
    const prsRes = await fetch(prsUrl, {
      headers: {
        Authorization: `Bearer ${azureToken}`,
        Accept: "application/json",
        "User-Agent": "CodeVibe-Vercel-Function",
      },
    });

    if (!prsRes.ok) {
      if (prsRes.status === 401) {
        return sendJson(res, 401, { error: "Azure DevOps connection expired. Please reconnect." });
      }
      return sendJson(res, prsRes.status, { error: "Failed to fetch pull requests from Azure DevOps." });
    }

    const prsData = await prsRes.json();
    const mappedPRs = (prsData.value || []).map((pr: any) => ({
      id: String(pr.pullRequestId),
      pullRequestId: pr.pullRequestId,
      title: pr.title,
      description: pr.description || "",
      status: pr.status?.toLowerCase() || "active",
      created_at: pr.creationDate,
      author: {
        displayName: pr.createdBy?.displayName || "Unknown",
        uniqueName: pr.createdBy?.uniqueName || "unknown",
        imageUrl: pr.createdBy?._links?.avatar?.href || "",
      },
      sourceRefName: pr.sourceRefName?.replace("refs/heads/", "") || "",
      targetRefName: pr.targetRefName?.replace("refs/heads/", "") || "",
      mergeStatus: pr.mergeStatus,
      lastMergeCommit: pr.lastMergeCommit?.commitId || "",
    }));

    return sendJson(res, 200, mappedPRs);
  } catch (err: any) {
    console.error("[fetch-azure-prs] Internal error:", err?.message || err);
    return sendJson(res, 500, { error: "Internal server error while fetching Azure DevOps pull requests." });
  }
}
