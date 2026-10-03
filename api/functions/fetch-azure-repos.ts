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
      .select("access_token, provider_user_id")
      .eq("user_id", user.id)
      .eq("provider", "azure")
      .single();

    if (dbError || !connection || !connection.access_token) {
      return res.status(404).json({ error: "Azure DevOps connection not found. Please connect your account." });
    }

    const azureToken = connection.access_token;

    // Get Azure organizations for the user
    let orgNames: string[] = [];
    try {
      const orgsRes = await fetch(
        `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${connection.provider_user_id || ""}&api-version=6.0`,
        {
          headers: {
            Authorization: `Bearer ${azureToken}`,
            Accept: "application/json",
            "User-Agent": "CodeVibe-Vercel-Function",
          },
        }
      );
      if (orgsRes.ok) {
        const orgsData = await orgsRes.json();
        orgNames = (orgsData.value || []).map((o: any) => o.accountName);
      }
    } catch {}

    if (orgNames.length === 0) {
      const orgEnv = process.env.AZURE_DEVOPS_ORG;
      if (orgEnv) orgNames = [orgEnv];
    }

    if (orgNames.length === 0) {
      return res.status(200).json([]);
    }

    const allRepos: any[] = [];
    for (const org of orgNames) {
      try {
        const reposRes = await fetch(
          `https://dev.azure.com/${org}/_apis/git/repositories?api-version=6.0`,
          {
            headers: {
              Authorization: `Bearer ${azureToken}`,
              Accept: "application/json",
              "User-Agent": "CodeVibe-Vercel-Function",
            },
          }
        );
        if (reposRes.ok) {
          const reposData = await reposRes.json();
          for (const r of reposData.value || []) {
            allRepos.push({
              id: r.id,
              name: r.name,
              full_name: `${org}/${r.project?.name}/${r.name}`,
              organization: org,
              project_name: r.project?.name || "",
              project_id: r.project?.id || "",
              description: r.project?.description || "",
              default_branch: r.defaultBranch?.replace("refs/heads/", "") || "main",
              web_url: r.webUrl || r.remoteUrl,
              size: r.size || 0,
              is_disabled: Boolean(r.isDisabled),
            });
          }
        }
      } catch {}
    }

    return res.status(200).json(allRepos);
  } catch (err: any) {
    console.error("[fetch-azure-repos] Internal error:", err?.message || err);
    return res.status(500).json({ error: "Internal server error while fetching Azure DevOps repositories." });
  }
}
