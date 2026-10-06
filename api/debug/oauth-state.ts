import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ADMIN_KEY;

  if (url && serviceKey && !url.includes("placeholder")) {
    return createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  // Require authorization - only the authenticated Cody user can run this
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: "Admin client not configured" }));
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: { user }, error: userError } = await admin.auth.getUser(token);

  if (userError || !user) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "Unauthorized", detail: userError?.message }));
  }

  const results: any = {
    authenticated_user_id: user.id,
    authenticated_email: user.email,
  };

  // 1. Query oauth_connections for this user + github
  const { data: connections, error: connError } = await admin
    .from("oauth_connections")
    .select("user_id, provider, provider_user_id, created_at, updated_at, expires_at")
    .eq("user_id", user.id)
    .eq("provider", "github");

  results.oauth_connections = {
    query_user_id: user.id,
    query_provider: "github",
    error: connError?.message || null,
    row_count: connections?.length ?? 0,
    rows: (connections || []).map((r: any) => ({
      user_id: r.user_id,
      provider: r.provider,
      provider_user_id: r.provider_user_id,
      has_access_token: false, // We'll check separately
      created_at: r.created_at,
      updated_at: r.updated_at,
      expires_at: r.expires_at,
    })),
  };

  // Check if access_token exists (without exposing it)
  const { data: tokenCheck, error: tokenCheckError } = await admin
    .from("oauth_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .eq("provider", "github");

  if (tokenCheck && tokenCheck.length > 0) {
    results.oauth_connections.rows[0].has_access_token = Boolean(tokenCheck[0].access_token);
    results.oauth_connections.rows[0].access_token_length = tokenCheck[0].access_token?.length ?? 0;
  }
  results.oauth_connections.token_check_error = tokenCheckError?.message || null;

  // 2. Query ALL oauth_connections for this user (any provider)
  const { data: allConns, error: allConnsError } = await admin
    .from("oauth_connections")
    .select("user_id, provider, provider_user_id, created_at, updated_at")
    .eq("user_id", user.id);

  results.all_oauth_connections = {
    error: allConnsError?.message || null,
    row_count: allConns?.length ?? 0,
    providers: (allConns || []).map((r: any) => r.provider),
  };

  // 3. Query oauth_states for this user (should be empty if burned)
  const { data: states, error: statesError } = await admin
    .from("oauth_states")
    .select("id, user_id, provider, created_at, expires_at, locked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  results.oauth_states = {
    error: statesError?.message || null,
    row_count: states?.length ?? 0,
    rows: (states || []).map((r: any) => ({
      id_prefix: r.id?.substring(0, 8) + "...",
      user_id: r.user_id,
      provider: r.provider,
      created_at: r.created_at,
      expires_at: r.expires_at,
      locked_at: r.locked_at,
      is_expired: new Date(r.expires_at) < new Date(),
    })),
  };

  // 4. Verify the check-github-connection path would work
  // Simulate what check-github-connection does: create anon client with user token
  const anonUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (anonUrl && anonKey) {
    const anonClient = createClient(anonUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: anonUser }, error: anonUserError } = await anonClient.auth.getUser(token);
    results.anon_client_check = {
      user_id: anonUser?.id || null,
      user_id_matches_admin: anonUser?.id === user.id,
      error: anonUserError?.message || null,
    };

    // Try reading oauth_connections with the anon client (subject to RLS)
    const { data: anonConn, error: anonConnError } = await anonClient
      .from("oauth_connections")
      .select("user_id, provider, provider_user_id")
      .eq("user_id", user.id)
      .eq("provider", "github");

    results.anon_client_oauth_connections = {
      error: anonConnError?.message || null,
      row_count: anonConn?.length ?? 0,
      rows: anonConn || [],
    };
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(results, null, 2));
}
