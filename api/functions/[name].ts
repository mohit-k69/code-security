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

function parseBody(req: any): any {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body || {};
}

async function authenticateRequest(req: any, res: any, admin: any): Promise<{ user: any; token: string } | null> {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) {
    sendJson(res, 401, { error: "No authorization header" });
    return null;
  }

  if (!admin) {
    sendJson(res, 503, { error: "Service unavailable: admin client not configured" });
    return null;
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }

  return { user, token };
}

// -----------------------------------------------------------------------------
// Operation Handlers
// -----------------------------------------------------------------------------

async function handleStoreProviderToken(req: any, res: any, admin: any) {
  // Diagnostic / Healthcheck
  if (req.method === "GET") {
    return sendJson(res, 200, {
      status: "ready",
      service: "store-provider-token",
      hasAdmin: Boolean(admin),
    });
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) {
    return sendJson(res, 401, { error: "No authorization header" });
  }

  if (!admin) {
    console.error("[store-provider-token] Supabase admin client not configured");
    return sendJson(res, 503, { error: "Service unavailable: admin client not configured" });
  }

  const auth = await authenticateRequest(req, res, admin);
  if (!auth) return;
  const { user } = auth;

  const body = parseBody(req);
  const { providerToken, providerRefreshToken, provider: requestedProvider } = body;

  if (!providerToken) {
    return sendJson(res, 400, { error: "Missing provider token" });
  }

  const validProviders = ["github", "gitlab", "bitbucket", "azure"];
  if (!requestedProvider || !validProviders.includes(requestedProvider)) {
    return sendJson(res, 400, { error: "Missing or invalid provider" });
  }
  const provider = requestedProvider;

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
      return sendJson(res, 400, { error: "Failed to validate GitLab token with provider" });
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
      return sendJson(res, 400, { error: "Failed to validate Bitbucket token with provider" });
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
      return sendJson(res, 400, { error: "Failed to validate GitHub token with provider" });
    }
    const githubUser = await githubUserRes.json();
    providerUserId = String(githubUser.id);
  }

  if (!providerUserId) {
    return sendJson(res, 400, { error: `Failed to extract ${provider} user ID` });
  }

  const { error: upsertError } = await (admin as any)
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
    return sendJson(res, 500, { error: "Failed to persist connection" });
  }

  console.log(`[store-provider-token] Success: provider=${provider} user=${user.id}`);
  return sendJson(res, 200, { success: true, message: "Provider connection secured" });
}

async function handleFetchGithubRepositories(req: any, res: any, admin: any) {
  const auth = await authenticateRequest(req, res, admin);
  if (!auth) return;
  const { user } = auth;

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
  const githubRes = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "CodeVibe-Vercel-Function",
    },
  });

  if (!githubRes.ok) {
    if (githubRes.status === 401) {
      return sendJson(res, 401, { error: "GitHub connection expired. Please reconnect." });
    }
    return sendJson(res, 502, { error: "Failed to fetch repositories from GitHub." });
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

  return sendJson(res, 200, mappedRepos);
}

async function handleFetchGithubPullRequests(req: any, res: any, admin: any) {
  const auth = await authenticateRequest(req, res, admin);
  if (!auth) return;
  const { user } = auth;

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
  const body = parseBody(req);
  const owner = body?.owner || req.query?.owner;
  const repo = body?.repo || req.query?.repo;

  if (!owner || !repo) {
    return sendJson(res, 400, { error: "Missing owner or repo parameter" });
  }

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
}

async function handleFetchGitlabProjects(req: any, res: any, admin: any) {
  const auth = await authenticateRequest(req, res, admin);
  if (!auth) return;
  const { user } = auth;

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
      return sendJson(res, 401, { error: "GitLab connection expired. Please reconnect." });
    }
    return sendJson(res, 502, { error: "Failed to fetch projects from GitLab." });
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

  return sendJson(res, 200, mapped);
}

async function handleFetchGitlabMergeRequests(req: any, res: any, admin: any) {
  const auth = await authenticateRequest(req, res, admin);
  if (!auth) return;
  const { user } = auth;

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
  const body = parseBody(req);
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
}

async function handleFetchBitbucketRepos(req: any, res: any, admin: any) {
  const auth = await authenticateRequest(req, res, admin);
  if (!auth) return;
  const { user } = auth;

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
}

async function handleFetchBitbucketPrs(req: any, res: any, admin: any) {
  const auth = await authenticateRequest(req, res, admin);
  if (!auth) return;
  const { user } = auth;

  const { data: connection, error: dbError } = await (admin as any)
    .from("oauth_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .eq("provider", "bitbucket")
    .single();

  if (dbError || !connection || !(connection as any).access_token) {
    return sendJson(res, 404, { error: "Bitbucket connection not found. Please connect your account." });
  }

  const bbToken = (connection as any).access_token;
  const body = parseBody(req);
  const repoFullName = body?.repoFullName || req.query?.repoFullName;
  if (!repoFullName) {
    return sendJson(res, 400, { error: "Missing repoFullName parameter" });
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
      return sendJson(res, 401, { error: "Bitbucket connection expired. Please reconnect." });
    }
    return sendJson(res, prsRes.status, { error: "Failed to fetch pull requests from Bitbucket." });
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

  return sendJson(res, 200, mappedPRs);
}

async function handleFetchAzureRepos(req: any, res: any, admin: any) {
  const auth = await authenticateRequest(req, res, admin);
  if (!auth) return;
  const { user } = auth;

  const { data: connection, error: dbError } = await (admin as any)
    .from("oauth_connections")
    .select("access_token, provider_user_id")
    .eq("user_id", user.id)
    .eq("provider", "azure")
    .single();

  if (dbError || !connection || !(connection as any).access_token) {
    return sendJson(res, 404, { error: "Azure DevOps connection not found. Please connect your account." });
  }

  const azureToken = (connection as any).access_token;
  const providerUserId = (connection as any).provider_user_id;

  let orgNames: string[] = [];
  try {
    const orgsRes = await fetch(
      `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${providerUserId || ""}&api-version=6.0`,
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
    return sendJson(res, 200, []);
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

  return sendJson(res, 200, allRepos);
}

async function handleFetchAzurePrs(req: any, res: any, admin: any) {
  const auth = await authenticateRequest(req, res, admin);
  if (!auth) return;
  const { user } = auth;

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
  const body = parseBody(req);
  const organization = body?.organization || req.query?.organization;
  const project = body?.project || req.query?.project;
  const repositoryId = body?.repositoryId || req.query?.repositoryId;

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
}

async function handleCheckGithubConnection(req: any, res: any, admin: any) {
  const auth = await authenticateRequest(req, res, admin);
  if (!auth) return;
  const { user } = auth;

  const { data: connection, error: dbError } = await (admin as any)
    .from("oauth_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .eq("provider", "github")
    .single();

  if (dbError || !connection || !(connection as any).access_token) {
    return sendJson(res, 200, { status: "disconnected" });
  }

  const githubToken = (connection as any).access_token;
  const githubRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "CodeVibe-Vercel-Function",
    },
  });

  if (!githubRes.ok) {
    if (githubRes.status === 401) {
      return sendJson(res, 200, { status: "expired" });
    }
    return sendJson(res, 200, { status: "error" });
  }

  const githubUser = await githubRes.json();
  return sendJson(res, 200, { status: "connected", username: githubUser.login });
}

async function handleDisconnectGithub(req: any, res: any, admin: any) {
  const auth = await authenticateRequest(req, res, admin);
  if (!auth) return;
  const { user } = auth;

  // Retrieve the access token before deleting
  const { data: connection } = await (admin as any)
    .from("oauth_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .eq("provider", "github")
    .single();

  if (connection && connection.access_token) {
    const clientId = process.env.GITHUB_INTEGRATION_CLIENT_ID;
    const clientSecret = process.env.GITHUB_INTEGRATION_CLIENT_SECRET;
    
    if (clientId && clientSecret) {
      try {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const revokeRes = await fetch(`https://api.github.com/applications/${clientId}/grant`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'CodeVibe-Vercel-Function'
          },
          body: JSON.stringify({ access_token: connection.access_token })
        });
        
        // ONLY 204 No Content means successfully revoked.
        if (revokeRes.status !== 204) {
          console.error('[disconnect-github] GitHub revocation failed with status:', revokeRes.status);
          return sendJson(res, 502, { error: 'Failed to revoke GitHub authorization. Please try again.' });
        }
      } catch (err: any) {
        console.error('[disconnect-github] GitHub revocation request error:', err.message);
        return sendJson(res, 500, { error: 'Internal error while revoking GitHub authorization.' });
      }
    } else {
      console.warn('[disconnect-github] Missing GitHub Client ID/Secret. Skipping revocation.');
    }
  }

  const { error: deleteError } = await (admin as any)
    .from("oauth_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "github");

  if (deleteError) {
    console.error("[disconnect-github] Delete failed:", deleteError.message);
    return sendJson(res, 500, { error: "Failed to disconnect GitHub" });
  }

  // Attempt to unlink legacy Supabase identity
  const { data: identities } = await (admin as any).auth.admin.getUserById(user.id);
  const githubIdentity = identities?.user?.identities?.find((id: any) => id.provider === 'github');
  if (githubIdentity) {
    try {
      await (admin as any).auth.admin.unlinkIdentity(user.id, githubIdentity);
    } catch (e: any) {
      console.warn('[disconnect-github] Failed to unlink legacy github identity:', e.message);
    }
  }

  return sendJson(res, 200, { success: true });
}

// -----------------------------------------------------------------------------
// Dynamic Dispatcher Router
// -----------------------------------------------------------------------------

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // Resolve operation name from req.query.name or parse from URL path
  const urlPath = (req.url || "").split("?")[0];
  const pathSegments = urlPath.split("/").filter(Boolean);
  const nameFromUrl = pathSegments[pathSegments.length - 1];
  
  let operation = (req.query?.name as string) || "";
  if (!operation || operation === "[name]" || operation === "functions") {
    operation = (nameFromUrl && nameFromUrl !== "[name]" && nameFromUrl !== "functions") ? nameFromUrl : "";
  }

  const admin = getSupabaseAdmin();

  try {
    switch (operation) {
      case "store-provider-token":
        return await handleStoreProviderToken(req, res, admin);

      case "fetch-github-repositories":
        return await handleFetchGithubRepositories(req, res, admin);

      case "fetch-github-pull-requests":
        return await handleFetchGithubPullRequests(req, res, admin);

      case "fetch-gitlab-projects":
        return await handleFetchGitlabProjects(req, res, admin);

      case "fetch-gitlab-merge-requests":
        return await handleFetchGitlabMergeRequests(req, res, admin);

      case "fetch-bitbucket-repos":
        return await handleFetchBitbucketRepos(req, res, admin);

      case "fetch-bitbucket-prs":
        return await handleFetchBitbucketPrs(req, res, admin);

      case "fetch-azure-repos":
        return await handleFetchAzureRepos(req, res, admin);

      case "fetch-azure-prs":
        return await handleFetchAzurePrs(req, res, admin);

      case "check-github-connection":
        return await handleCheckGithubConnection(req, res, admin);

      case "disconnect-github":
        return await handleDisconnectGithub(req, res, admin);

      default:
        console.warn(`[api/functions] Unknown operation requested: "${operation}"`);
        return sendJson(res, 404, { error: `Function "${operation}" not found` });
    }
  } catch (err: any) {
    console.error(`[api/functions/${operation}] Internal error:`, err?.message || err);
    return sendJson(res, 500, { error: err?.message || "Internal server error" });
  }
}
