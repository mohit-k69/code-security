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

function getSupabaseUserClient(authHeader: string) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "No authorization header" });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      console.error("[store-provider-token] Supabase admin client not configured");
      return res.status(503).json({ error: "Service unavailable: admin client not configured" });
    }

    // Verify the user's JWT
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const { providerToken, providerRefreshToken, provider: requestedProvider } = body || {};

    if (!providerToken) {
      return res.status(400).json({ error: "Missing provider token" });
    }

    const validProviders = ["github", "gitlab", "bitbucket", "azure"];
    if (!requestedProvider || !validProviders.includes(requestedProvider)) {
      return res.status(400).json({ error: "Missing or invalid provider" });
    }
    const provider = requestedProvider;

    // Validate the token by fetching the user profile from the provider
    let providerUserId = "";

    if (provider === "gitlab") {
      const gitlabUserRes = await fetch("https://gitlab.com/api/v4/user", {
        headers: {
          Authorization: `Bearer ${providerToken}`,
          Accept: "application/json",
          "User-Agent": "CodeVibe-Vercel-Function",
        },
      });
      if (!gitlabUserRes.ok) {
        return res.status(400).json({ error: "Failed to validate GitLab token with provider" });
      }
      const gitlabUser = await gitlabUserRes.json();
      providerUserId = String(gitlabUser.id);
    } else if (provider === "bitbucket") {
      const bbUserRes = await fetch("https://api.bitbucket.org/2.0/user", {
        headers: {
          Authorization: `Bearer ${providerToken}`,
          Accept: "application/json",
          "User-Agent": "CodeVibe-Vercel-Function",
        },
      });
      if (!bbUserRes.ok) {
        return res.status(400).json({ error: "Failed to validate Bitbucket token with provider" });
      }
      const bbUser = await bbUserRes.json();
      providerUserId = String(bbUser.account_id || bbUser.uuid || bbUser.username || "bitbucket_user");
    } else if (provider === "azure") {
      const azureUserRes = await fetch(
        "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0",
        {
          headers: {
            Authorization: `Bearer ${providerToken}`,
            Accept: "application/json",
            "User-Agent": "CodeVibe-Vercel-Function",
          },
        }
      );
      if (azureUserRes.ok) {
        const azureUser = await azureUserRes.json();
        providerUserId = String(azureUser.id || azureUser.publicAlias || "azure_user");
      } else {
        providerUserId = user.id;
      }
    } else {
      // GitHub
      const githubUserRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${providerToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "CodeVibe-Vercel-Function",
        },
      });
      if (!githubUserRes.ok) {
        return res.status(400).json({ error: "Failed to validate GitHub token with provider" });
      }
      const githubUser = await githubUserRes.json();
      providerUserId = String(githubUser.id);
    }

    if (!providerUserId) {
      return res.status(400).json({ error: `Failed to extract ${provider} user ID` });
    }

    // Upsert the token into the database using the Service Role Key
    const { error: upsertError } = await admin
      .from("oauth_connections")
      .upsert(
        {
          user_id: user.id,
          provider: provider,
          provider_user_id: providerUserId,
          access_token: providerToken,
          refresh_token: providerRefreshToken || null,
          expires_at: null,
        },
        { onConflict: "user_id,provider" }
      );

    if (upsertError) {
      console.error("[store-provider-token] Database upsert failed:", upsertError.message);
      return res.status(500).json({ error: "Failed to persist connection" });
    }

    console.log(`[store-provider-token] Success: provider=${provider} user=${user.id}`);
    return res.status(200).json({ success: true, message: "Provider connection secured" });
  } catch (err: any) {
    console.error("[store-provider-token] Internal error:", err?.message || err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
