import { createClient } from "@supabase/supabase-js";

class AuthCheckError extends Error {
  code: "ADMIN_CLIENT_UNAVAILABLE" | "LOOKUP_TIMEOUT" | "LOOKUP_FAILED";
  constructor(code: "ADMIN_CLIENT_UNAVAILABLE" | "LOOKUP_TIMEOUT" | "LOOKUP_FAILED", message: string) {
    super(message);
    this.name = "AuthCheckError";
    this.code = code;
  }
}

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

function getSafeProjectRef(): string {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const match = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : (url ? "custom-url" : "missing");
}

async function checkAuthEmailExists(normalizedEmail: string, timeoutMs = 4500): Promise<boolean> {
  const admin = getSupabaseAdmin();

  if (!admin) {
    console.warn("[check-email] Supabase admin client not configured. SUPABASE_SERVICE_ROLE_KEY missing.");
    throw new AuthCheckError("ADMIN_CLIENT_UNAVAILABLE", "Supabase admin client not available");
  }

  const lookupPromise = (async (): Promise<boolean> => {
    try {
      let page = 1;
      const perPage = 100;
      const maxPages = 10; // bounded to max 1,000 users

      while (page <= maxPages) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) {
          throw new Error(`listUsers error: ${error.message} (status: ${error.status})`);
        }

        const users = data?.users || [];
        for (const u of users) {
          if (u.email && u.email.trim().toLowerCase() === normalizedEmail) {
            return true;
          }
          const identities = (u as any).identities || [];
          for (const ident of identities) {
            const identEmail = ident.email || ident.identity_data?.email;
            if (identEmail && String(identEmail).trim().toLowerCase() === normalizedEmail) {
              return true;
            }
          }
        }

        if (users.length < perPage) {
          return false;
        }

        if (typeof data.total === "number" && page * perPage >= data.total) {
          return false;
        }

        page++;
      }

      return false;
    } catch (err: any) {
      console.error("[check-email] listUsers check error:", err?.message || err);
      const underlying = err?.message || String(err);
      throw new AuthCheckError("LOOKUP_FAILED", `Failed to query users from Supabase: ${underlying}`);
    }
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new AuthCheckError("LOOKUP_TIMEOUT", `Email check timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
  });

  return Promise.race([lookupPromise, timeoutPromise]);
}

function sendJson(res: any, status: number, body: Record<string, any>) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  if (typeof res.json === "function") {
    return res.json(body);
  }
  return res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  const reqStart = Date.now();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const hasUrl = Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const hasServiceRoleKey = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ADMIN_KEY
  );
  const hasAnonKey = Boolean(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
  const projectRef = getSafeProjectRef();

  // Safe diagnostics endpoint on GET
  if (req.method === "GET") {
    console.log("[check-email] GET diagnostic request received");
    return sendJson(res, 200, {
      status: "ready",
      service: "check-email",
      env: {
        hasUrl,
        projectRef,
        hasServiceRoleKey,
        hasAnonKey,
      },
    });
  }

  console.log("[check-email] request received", { method: req.method });

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const rawEmail = body?.email || req.query?.email;
    if (!rawEmail || typeof rawEmail !== "string") {
      console.log("[check-email] validation rejected: email missing or invalid");
      return sendJson(res, 400, { error: "Email is required" });
    }

    const normalizedEmail = rawEmail.trim().toLowerCase();
    console.log("[check-email] validation complete", { emailLength: normalizedEmail.length });
    console.log("[check-email] admin client initialized", { hasUrl, hasServiceRoleKey, projectRef });

    if (!hasServiceRoleKey) {
      console.warn("[check-email] service unavailable: SUPABASE_SERVICE_ROLE_KEY missing");
      return sendJson(res, 503, {
        error: "EMAIL_CHECK_UNAVAILABLE",
        reason: "ADMIN_CLIENT_UNAVAILABLE",
        env: { hasUrl, projectRef, hasServiceRoleKey: false },
      });
    }

    console.log("[check-email] starting Supabase lookup");
    const exists = await checkAuthEmailExists(normalizedEmail, 4500);
    const lookupDuration = Date.now() - reqStart;
    console.log("[check-email] lookup completed", { durationMs: lookupDuration, exists });

    const responsePayload = { exists, email: normalizedEmail };
    console.log("[check-email] response sent", { statusCode: 200, durationMs: Date.now() - reqStart });
    return sendJson(res, 200, responsePayload);
  } catch (err: any) {
    const errorDuration = Date.now() - reqStart;
    if (err instanceof AuthCheckError || err?.name === "AuthCheckError") {
      if (err.code === "ADMIN_CLIENT_UNAVAILABLE") {
        console.warn(`[check-email] service unavailable (${errorDuration}ms): ${err.message}`);
        console.log("[check-email] response sent", { statusCode: 503 });
        return sendJson(res, 503, {
          error: "EMAIL_CHECK_UNAVAILABLE",
          reason: "ADMIN_CLIENT_UNAVAILABLE",
        });
      }
      if (err.code === "LOOKUP_TIMEOUT") {
        console.warn(`[check-email] lookup timed out (${errorDuration}ms): ${err.message}`);
        console.log("[check-email] response sent", { statusCode: 504 });
        return sendJson(res, 504, {
          error: "EMAIL_CHECK_TIMEOUT",
          reason: "LOOKUP_TIMEOUT",
        });
      }
    }

    console.error(`[check-email] lookup error (${errorDuration}ms):`, err?.message || err);
    console.log("[check-email] response sent", { statusCode: 500 });
    return sendJson(res, 500, {
      error: "EMAIL_CHECK_FAILED",
      details: String(err?.message || err || "unknown"),
      name: err?.name,
      code: err?.code,
    });
  }
}
