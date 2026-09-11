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

  // 1. Direct authoritative check via Supabase Auth Admin generateLink (O(1), primary email check)
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: normalized,
    });
    if (!error && data?.user?.id) {
      return true;
    }
  } catch {
    // Continue to comprehensive scan
  }

  // 2. Comprehensive check across all auth users (including user_metadata and linked OAuth identities)
  try {
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users || data.users.length === 0) break;

      for (const u of data.users) {
        if (u.email && u.email.trim().toLowerCase() === normalized) {
          return true;
        }
        if (u.user_metadata?.email && String(u.user_metadata.email).trim().toLowerCase() === normalized) {
          return true;
        }

        // For OAuth providers (Google, GitHub, etc.), inspect linked identities if needed
        const providers = u.app_metadata?.providers || [];
        if (providers.some((p: string) => p !== 'email')) {
          try {
            const userDetail = await admin.auth.admin.getUserById(u.id);
            const identities = userDetail.data?.user?.identities || [];
            for (const ident of identities) {
              if (ident.email && ident.email.trim().toLowerCase() === normalized) {
                return true;
              }
              if (ident.identity_data?.email && String(ident.identity_data.email).trim().toLowerCase() === normalized) {
                return true;
              }
            }
          } catch {
            // Ignore single user detail error and continue
          }
        }
      }

      if (data.users.length < 1000) break;
      page++;
    }
  } catch (err) {
    console.error("Error in checkAuthEmailExists listUsers:", err);
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
  app.all("/api/auth/check-email", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    try {
      const email = req.body?.email || req.query?.email;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: "Email is required", exists: false });
      }
      const normalizedEmail = email.trim().toLowerCase();
      const exists = await checkAuthEmailExists(normalizedEmail);
      console.log(`[check-email] Checked "${normalizedEmail}": exists=${exists}`);
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

