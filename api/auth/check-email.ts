import { checkAuthEmailExists, AuthCheckError } from "../../src/lib/authCheck";

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

    const email = body?.email || req.query?.email;
    if (!email || typeof email !== "string") {
      console.log("[check-email] validation rejected: email missing or invalid");
      return sendJson(res, 400, { error: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log("[check-email] validation complete", { emailLength: normalizedEmail.length });

    const hasUrl = Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
    const hasServiceRoleKey = Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ADMIN_KEY
    );
    console.log("[check-email] admin client initialized", { hasUrl, hasServiceRoleKey });

    console.log("[check-email] starting Supabase lookup");
    const exists = await checkAuthEmailExists(normalizedEmail, 4500);
    const lookupDuration = Date.now() - reqStart;
    console.log("[check-email] lookup completed", { durationMs: lookupDuration, exists });

    const responsePayload = { exists, email: normalizedEmail };
    console.log("[check-email] response sent", { statusCode: 200, durationMs: Date.now() - reqStart });
    return sendJson(res, 200, responsePayload);
  } catch (err: any) {
    const errorDuration = Date.now() - reqStart;
    if (err instanceof AuthCheckError || err?.name === 'AuthCheckError') {
      if (err.code === 'ADMIN_CLIENT_UNAVAILABLE') {
        console.warn(`[check-email] service unavailable (${errorDuration}ms): ${err.message}`);
        console.log("[check-email] response sent", { statusCode: 503 });
        return sendJson(res, 503, { error: "EMAIL_CHECK_UNAVAILABLE", reason: "ADMIN_CLIENT_UNAVAILABLE" });
      }
      if (err.code === 'LOOKUP_TIMEOUT') {
        console.warn(`[check-email] lookup timed out (${errorDuration}ms): ${err.message}`);
        console.log("[check-email] response sent", { statusCode: 504 });
        return sendJson(res, 504, { error: "EMAIL_CHECK_TIMEOUT", reason: "LOOKUP_TIMEOUT" });
      }
    }

    console.error(`[check-email] lookup error (${errorDuration}ms):`, err?.message || err);
    console.log("[check-email] response sent", { statusCode: 500 });
    return sendJson(res, 500, { error: "EMAIL_CHECK_FAILED" });
  }
}

