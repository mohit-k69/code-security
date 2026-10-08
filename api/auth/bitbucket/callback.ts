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

  const redirectError = (msg: string) => {
    res.statusCode = 302;
    const redirectUrl = new URL(req.headers.origin || process.env.PUBLIC_SITE_URL || `https://${req.headers.host || "localhost:5173"}`);
    redirectUrl.pathname = "/sync";
    redirectUrl.searchParams.set("workflow", "bitbucket");
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

  const clientId = process.env.BITBUCKET_CLIENT_ID || process.env.VITE_BITBUCKET_CLIENT_ID;
  const clientSecret = process.env.BITBUCKET_CLIENT_SECRET || process.env.VITE_BITBUCKET_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return redirectError("OAuth application not configured on server");
  }

  try {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { data: stateRecords, error: stateError } = await admin
      .from("oauth_states")
      .update({ locked_at: new Date().toISOString() })
      .eq("id", state)
      .gt("expires_at", new Date().toISOString())
      .or(`locked_at.is.null,locked_at.lt.${oneMinuteAgo}`)
      .select("user_id, expires_at");

    if (stateError || !stateRecords || stateRecords.length === 0) {
      return redirectError("Invalid, expired, or currently processing authorization session");
    }

    const stateRecord = stateRecords[0];
    const userId = stateRecord.user_id;

    const cleanupState = async (isTransient: boolean = false) => {
      if (isTransient) {
        await admin.from("oauth_states").update({ locked_at: null }).eq("id", state);
      } else {
        await admin.from("oauth_states").delete().eq("id", state);
      }
    };

    const origin = req.headers.origin || process.env.PUBLIC_SITE_URL || `https://${req.headers.host || "localhost:5173"}`;
    const redirectUri = `${origin}/api/auth/bitbucket/callback`;

    let tokenRes;
    try {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('redirect_uri', redirectUri);

      tokenRes = await fetch("https://bitbucket.org/site/oauth2/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "Authorization": `Basic ${basicAuth}`
        },
        body: params.toString(),
      });
    } catch (e) {
      await cleanupState(true);
      return redirectError("Failed to reach Bitbucket for token exchange");
    }

    if (!tokenRes.ok) {
      const isTransient = tokenRes.status >= 500;
      await cleanupState(isTransient);
      return redirectError("Failed to exchange authorization code");
    }

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      await cleanupState(false);
      return redirectError(tokenData.error_description || "Invalid authorization code");
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;

    if (!accessToken) {
      await cleanupState(false);
      return redirectError("No access token returned from Bitbucket");
    }

    let userRes;
    try {
      userRes = await fetch("https://api.bitbucket.org/2.0/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "User-Agent": "Cody-Code-Security",
        },
      });
    } catch (e) {
      await cleanupState(false);
      return redirectError("Failed to reach Bitbucket for validation");
    }

    if (!userRes.ok) {
      await cleanupState(false);
      return redirectError("Failed to validate Bitbucket token");
    }

    const bbUser = await userRes.json();
    const providerUserId = String(bbUser.account_id || bbUser.uuid || bbUser.username || "bitbucket_user");

    let expiresAt = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    }

    const { error: upsertError } = await admin
      .from("oauth_connections")
      .upsert(
        {
          user_id: userId,
          provider: "bitbucket",
          provider_user_id: providerUserId,
          access_token: accessToken,
          refresh_token: refreshToken || null,
          expires_at: expiresAt,
        },
        { onConflict: "user_id,provider" }
      );

    if (upsertError) {
      console.error("[bitbucket-callback] Upsert failed:", upsertError.message);
      await cleanupState(false);
      return redirectError("Failed to store Bitbucket connection");
    }

    await cleanupState(false);

    res.statusCode = 302;
    const successUrl = new URL(req.headers.origin || process.env.PUBLIC_SITE_URL || `https://${req.headers.host || "localhost:5173"}`);
    successUrl.pathname = "/sync";
    successUrl.searchParams.set("workflow", "bitbucket");
    successUrl.searchParams.set("bitbucket_connected", "true");
    res.setHeader("Location", successUrl.toString());
    return res.end();
  } catch (err: any) {
    console.error("[bitbucket-callback] Internal error:", err?.message || err);
    return redirectError("An internal server error occurred");
  }
}
