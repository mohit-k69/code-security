import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { checkAuthEmailExists } from "./src/lib/authCheck";

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

