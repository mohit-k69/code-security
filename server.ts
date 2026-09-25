import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { checkAuthEmailExists, getSupabaseAdmin } from "./src/lib/authCheck";
import { generateAndStoreRecoveryCodes } from "./src/lib/recoveryCodes";

dotenv.config({ path: '.env.local' });
dotenv.config();

export { checkAuthEmailExists };

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // Generate secure one-time recovery codes endpoint (trusted server backend)
  app.all("/api/auth/recovery-codes/generate", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
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

      const codes = await generateAndStoreRecoveryCodes(admin, user.id);
      return res.json({ success: true, count: codes.length, codes });
    } catch (err: any) {
      console.error("[recovery-codes] generation endpoint error");
      return res.status(500).json({ error: "RECOVERY_CODES_GENERATION_FAILED" });
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

