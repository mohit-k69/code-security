import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: '.env.local' });
dotenv.config();

let supabaseAdminClient: ReturnType<typeof createClient> | null = null;

function getSupabaseAdmin() {
  if (supabaseAdminClient) return supabaseAdminClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey && !url.includes('placeholder')) {
    supabaseAdminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdminClient;
}

export async function checkAuthEmailExists(rawEmail: string): Promise<boolean> {
  const normalized = rawEmail.trim().toLowerCase();
  const admin = getSupabaseAdmin();
  if (!admin) return false;

  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users || data.users.length === 0) break;
    if (data.users.some((u: any) => u.email && u.email.trim().toLowerCase() === normalized)) {
      return true;
    }
    if (data.users.length < 1000) break;
    page++;
  }
  return false;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Check if an email already belongs to an existing Supabase Auth user (authoritative duplicate check)
  app.post("/api/auth/check-email", async (req, res) => {
    try {
      const email = req.body?.email;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: "Email is required", exists: false });
      }
      const normalizedEmail = email.trim().toLowerCase();
      const exists = await checkAuthEmailExists(normalizedEmail);
      return res.json({ exists, email: normalizedEmail });
    } catch (err: any) {
      console.error("Error in /api/auth/check-email:", err);
      return res.status(500).json({ error: "Failed to verify email existence", exists: false });
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

