import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { checkAuthEmailExists, getSupabaseAdmin } from "./src/lib/authCheck";
import { generateAndStoreRecoveryCodes, getRecoveryCodesStatus } from "./src/lib/recoveryCodes";
import { handleRecoveryVerification, resolveClientIp, handlePasswordResetWithTicket } from "./src/lib/recoveryVerification";
import {
  handleRecoveryCodesGenerationRequest,
  isOAuthOnlyUser,
  createStepUpReauthToken,
  verifyCurrentPassword,
} from "./src/lib/recoveryReauth";

dotenv.config({ path: '.env.local' });
dotenv.config();

export { checkAuthEmailExists };

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Securely evaluate trusted proxy hops (Cloud Run / reverse proxy)
  app.set("trust proxy", 1);

  app.use(express.json());

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Check if an email already belongs to an existing Supabase Auth user (authoritative duplicate check)
  app.all("/api/auth/check-email", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    const hasUrl = Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
    const hasServiceRoleKey = Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ADMIN_KEY
    );
    const hasAnonKey = Boolean(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const match = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
    const projectRef = match ? match[1] : (url ? "custom-url" : "missing");

    if (req.method === "GET") {
      return res.json({
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

    const reqStart = Date.now();
    try {
      const email = req.body?.email || req.query?.email;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: "Email is required" });
      }
      const normalizedEmail = email.trim().toLowerCase();
      console.log(`[check-email] starting Supabase lookup for "${normalizedEmail}"`);
      const exists = await checkAuthEmailExists(normalizedEmail, 4500);
      console.log(`[check-email] lookup completed in ${Date.now() - reqStart}ms: exists=${exists}`);
      return res.json({ exists, email: normalizedEmail });
    } catch (err: any) {
      const errorDuration = Date.now() - reqStart;
      if (err?.name === 'AuthCheckError') {
        if (err.code === 'ADMIN_CLIENT_UNAVAILABLE') {
          console.warn(`[check-email] service unavailable (${errorDuration}ms): ${err.message}`);
          return res.status(503).json({ error: "EMAIL_CHECK_UNAVAILABLE", reason: "ADMIN_CLIENT_UNAVAILABLE" });
        }
        if (err.code === 'LOOKUP_TIMEOUT') {
          console.warn(`[check-email] lookup timed out (${errorDuration}ms): ${err.message}`);
          return res.status(504).json({ error: "EMAIL_CHECK_TIMEOUT", reason: "LOOKUP_TIMEOUT" });
        }
      }
      console.error(`[check-email] error in /api/auth/check-email (${errorDuration}ms):`, err);
      return res.status(500).json({ error: "EMAIL_CHECK_FAILED" });
    }
  });

  // Generate or regenerate secure recovery codes endpoint (trusted server backend)
  // Strictly requires step-up reauthentication if active codes already exist
  app.all(["/api/auth/recovery-codes/generate", "/api/auth/recovery-codes/regenerate"], async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed. POST is required." });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: "ADMIN_SERVICE_UNAVAILABLE" });
    }

    try {
      const { data: { user }, error: userError } = await admin.auth.getUser(token);
      if (userError || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Delegate to secure handler enforcing step-up, user lock, and zero credential logging
      const result = await handleRecoveryCodesGenerationRequest(admin, {
        userId: user.id,
        user,
        currentPassword: req.body?.currentPassword,
        reauthToken: req.body?.reauthToken,
      });

      return res.status(result.status).json(result.body);
    } catch (err: any) {
      console.error("[recovery-codes] generation endpoint error");
      return res.status(500).json({ error: "RECOVERY_CODES_GENERATION_FAILED" });
    }
  });

  // Step-up reauthentication endpoint: exchanges current password for an ephemeral (2 min) single-use token
  app.all("/api/auth/recovery-codes/reauthenticate", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed. POST is required." });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: "ADMIN_SERVICE_UNAVAILABLE" });
    }

    try {
      const { data: { user }, error: userError } = await admin.auth.getUser(token);
      if (userError || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Block OAuth-only accounts from fake password reauthentication
      if (isOAuthOnlyUser(user)) {
        return res.status(403).json({
          error: "OAUTH_REAUTHENTICATION_UNSUPPORTED",
          message: "Step-up reauthentication is currently unavailable for OAuth-only accounts.",
        });
      }

      const password = req.body?.password;
      if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "PASSWORD_REQUIRED", message: "Current password is required." });
      }

      const isValid = await verifyCurrentPassword(user.email, password);
      if (!isValid) {
        return res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Incorrect current password." });
      }

      // Issue short-lived, single-use reauth token strictly bound to user.id
      const stepUp = createStepUpReauthToken(user.id);
      return res.json({
        success: true,
        reauthToken: stepUp.token,
        expiresInSeconds: stepUp.expiresInSeconds,
      });
    } catch (err: any) {
      console.error("[recovery-codes] reauthentication endpoint error");
      return res.status(500).json({ error: "REAUTHENTICATION_FAILED" });
    }
  });

  // Get recovery codes status (active count, creation date, OAuth status) for authenticated user
  app.all("/api/auth/recovery-codes/status", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed. GET is required." });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Missing authorization header" });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: "ADMIN_SERVICE_UNAVAILABLE" });
    }

    try {
      const { data: { user }, error: userError } = await admin.auth.getUser(token);
      if (userError || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const status = await getRecoveryCodesStatus(admin, user.id);
      const isOAuthOnly = isOAuthOnlyUser(user);

      return res.json({
        success: true,
        ...status,
        isOAuthOnly,
        canRegenerate: !isOAuthOnly,
      });
    } catch (err: any) {
      console.error("[recovery-codes] status endpoint error");
      return res.status(500).json({ error: "RECOVERY_CODES_STATUS_FAILED" });
    }
  });

  // Verify recovery code endpoint (trusted server backend)
  app.all("/api/auth/recovery/verify", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: "ADMIN_SERVICE_UNAVAILABLE" });
    }

    // Secure client IP extraction: Express evaluates trust proxy correctly from the right,
    // preventing attackers from spoofing X-Forwarded-For headers to bypass rate limits.
    const ip = req.ip || resolveClientIp(req.socket?.remoteAddress, req.headers["x-forwarded-for"], 1);

    const email = req.body?.email || req.body?.identifier;
    const code = req.body?.code;

    try {
      const result = await handleRecoveryVerification(admin, {
        identifier: email,
        code,
        ip,
      });

      // CRITICAL: Deliver the recovery ticket ONLY via secure HttpOnly cookie.
      // Plaintext recovery ticket is NEVER included in the response body.
      if (result.success && result.ticket) {
        const isProduction = process.env.NODE_ENV === "production";
        const isSecure = isProduction || req.secure || req.headers["x-forwarded-proto"] === "https";

        res.cookie("recovery_ticket", result.ticket, {
          httpOnly: true,
          secure: isSecure,
          sameSite: "strict",
          path: "/api/auth/recovery",
          maxAge: 15 * 60 * 1000, // 15 minutes
        });
      }

      // Response body contains ONLY non-secret fields: { success: true, expires_at: "..." }
      return res.status(result.status).json(result.body);
    } catch (err: any) {
      console.error("[recovery-verification] endpoint error");
      return res.status(500).json({ error: "RECOVERY_VERIFICATION_FAILED" });
    }
  });

  // Helper to extract cookie from request header
  function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
    if (!cookieHeader) return undefined;
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  // Password reset endpoint using restricted recovery ticket (Phase 3)
  app.all("/api/auth/recovery/reset-password", async (req, res) => {
    // 1. Mandatory POST: reject GET and other methods
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.sendStatus(204);
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed. POST is required." });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: "ADMIN_SERVICE_UNAVAILABLE" });
    }

    // 2. Recovery ticket MUST come exclusively from HttpOnly cookie
    // The React application must NOT receive, read, store, or send plaintext recovery ticket
    const ticketFromCookie = getCookieValue(req.headers.cookie, "recovery_ticket");

    // Do NOT accept ticket as JSON field, query param, URL path, or Authorization header
    const ip = req.ip || resolveClientIp(req.socket?.remoteAddress, req.headers["x-forwarded-for"], 1);

    try {
      const result = await handlePasswordResetWithTicket(admin, {
        ticket: ticketFromCookie,
        newPassword: req.body?.newPassword,
        confirmPassword: req.body?.confirmPassword,
        ip,
        origin: req.headers["origin"] as string,
        referer: req.headers["referer"] as string,
        secFetchSite: req.headers["sec-fetch-site"] as string,
        method: req.method,
      });

      if (
        result.success ||
        (result.status === 400 && result.body?.error === "INVALID_RECOVERY_TICKET") ||
        (result.status === 500 && result.body?.error === "RECOVERY_TRANSACTION_UNCERTAIN")
      ) {
        // Clear recovery_ticket cookie immediately upon reset or when invalid/consumed
        const isProduction = process.env.NODE_ENV === "production";
        const isSecure = isProduction || req.secure || req.headers["x-forwarded-proto"] === "https";

        res.clearCookie("recovery_ticket", {
          path: "/api/auth/recovery",
          httpOnly: true,
          secure: isSecure,
          sameSite: "strict",
        });
      }

      return res.status(result.status).json(result.body);
    } catch (err: any) {
      console.error("[recovery-reset-password] endpoint error");
      return res.status(500).json({ error: "PASSWORD_RESET_FAILED" });
    }
  });

  // Download Markdown file API endpoint
  app.post("/api/download-markdown", (req, res) => {
    const { content, filename } = req.body;
    const safeFilename = (filename || "security-remediation.md").replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.send(content || "");
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

