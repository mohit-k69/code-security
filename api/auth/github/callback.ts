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

  // Helper to redirect to Cody with an error state
  const redirectError = (msg: string) => {
    res.statusCode = 302;
    // Fall back to the secure production origin if state validation fails
    const redirectUrl = new URL(process.env.PUBLIC_SITE_URL || "https://code-security-review.vercel.app");
    redirectUrl.pathname = "/sync";
    redirectUrl.searchParams.set("workflow", "github");
    redirectUrl.searchParams.set("error", encodeURIComponent(msg));
    res.setHeader("Location", redirectUrl.toString());
    return res.end();
  };

  const code = req.query?.code;
  const state = req.query?.state;

  if (!code || !state) {
    return redirectError("Missing authorization code or state");
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return redirectError("Server configuration error");
  }

  const clientId = process.env.GITHUB_INTEGRATION_CLIENT_ID;
  const clientSecret = process.env.GITHUB_INTEGRATION_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return redirectError("OAuth application not configured on server");
  }

  try {
    // 1. Atomically lock the state to prevent concurrent usage
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: stateRecords, error: stateError } = await admin
      .from("oauth_states")
      .update({ locked_at: new Date().toISOString() })
      .eq("id", state)
      .gt("expires_at", new Date().toISOString())
      .or(`locked_at.is.null,locked_at.lt.${oneMinuteAgo}`)
      .select("user_id, expires_at, origin");

    if (stateError || !stateRecords || stateRecords.length === 0) {
      return redirectError("Invalid, expired, or currently processing authorization session");
    }

    const stateRecord = stateRecords[0];
    const userId = stateRecord.user_id;
    const origin = stateRecord.origin || "https://code-security-review.vercel.app";

    // Helper to cleanup state based on success or transient failure
    const cleanupState = async (isTransient: boolean = false) => {
      if (isTransient) {
        // Unlock for retry
        await admin.from("oauth_states").update({ locked_at: null }).eq("id", state);
      } else {
        // Burn state
        await admin.from("oauth_states").delete().eq("id", state);
      }
    };

    // 2. Exchange code for access token
    let tokenRes;
    try {
      tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });
    } catch (e) {
      await cleanupState(true); // Transient network failure
      return redirectError("Failed to reach GitHub for token exchange");
    }

    if (!tokenRes.ok) {
      // 5xx errors from GitHub are transient, 4xx are permanent
      const isTransient = tokenRes.status >= 500;
      await cleanupState(isTransient);
      return redirectError("Failed to exchange authorization code");
    }

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      await cleanupState(false); // Code invalid/expired is permanent
      return redirectError(tokenData.error_description || "Invalid authorization code");
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;

    if (!accessToken) {
      await cleanupState(false);
      return redirectError("No access token returned from GitHub");
    }

    // 3. Validate token by fetching GitHub user ID
    let userRes;
    try {
      userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Cody-Code-Security",
        },
      });
    } catch (e) {
      // We got the token but failed to validate it. Token might be valid but network failed.
      // Better to burn state since we used the code successfully, user must re-auth.
      await cleanupState(false);
      return redirectError("Failed to reach GitHub for validation");
    }

    if (!userRes.ok) {
      await cleanupState(false);
      return redirectError("Failed to validate GitHub token");
    }

    const githubUser = await userRes.json();
    const providerUserId = String(githubUser.id);

    // 4. Store the connection against the validated Cody user_id
    let expiresAt = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    }

    const { error: upsertError } = await admin
      .from("oauth_connections")
      .upsert(
        {
          user_id: userId,
          provider: "github",
          provider_user_id: providerUserId,
          access_token: accessToken,
          refresh_token: refreshToken || null,
          expires_at: expiresAt,
        },
        { onConflict: "user_id,provider" }
      );

    if (upsertError) {
      console.error("[github-callback] Upsert failed:", upsertError.message);
      await cleanupState(false);
      return redirectError("Failed to store GitHub connection");
    }

    // Burn state successfully
    await cleanupState(false);

    // 5. Success! Redirect back
    res.statusCode = 302;
    const successUrl = new URL(origin);
    successUrl.pathname = "/sync";
    successUrl.searchParams.set("workflow", "github");
    successUrl.searchParams.set("github_connected", "true");
    res.setHeader("Location", successUrl.toString());
    return res.end();
  } catch (err: any) {
    console.error("[github-callback] Internal error:", err?.message || err);
    return redirectError("An internal server error occurred");
  }
}
