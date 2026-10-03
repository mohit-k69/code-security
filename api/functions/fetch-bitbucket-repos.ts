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
      return sendJson(res, 404, { error: "Bitbucket is not connected. Please connect your account." });
    }

    const bbToken = (connection as any).access_token;

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
        return sendJson(res, 401, { error: "Bitbucket connection expired. Please reconnect." });
      }
      return sendJson(res, bbRes.status, { error: "Failed to fetch repositories from Bitbucket." });
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

    return sendJson(res, 200, repos);
  } catch (err: any) {
    console.error("[fetch-bitbucket-repos] Internal error:", err?.message || err);
    return sendJson(res, 500, { error: "Internal server error while fetching Bitbucket repositories." });
  }
}
