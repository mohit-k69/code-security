import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: '.env.local' });
dotenv.config();

let supabaseAdminClient: ReturnType<typeof createClient> | null = null;

export class AuthCheckError extends Error {
  code: 'ADMIN_CLIENT_UNAVAILABLE' | 'LOOKUP_TIMEOUT' | 'LOOKUP_FAILED';
  constructor(code: 'ADMIN_CLIENT_UNAVAILABLE' | 'LOOKUP_TIMEOUT' | 'LOOKUP_FAILED', message: string) {
    super(message);
    this.name = 'AuthCheckError';
    this.code = code;
  }
}

export function getSupabaseAdmin() {
  if (supabaseAdminClient) return supabaseAdminClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ADMIN_KEY;

  if (url && serviceKey && !url.includes('placeholder')) {
    supabaseAdminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdminClient;
}

export async function checkAuthEmailExists(rawEmail: string, timeoutMs = 4500): Promise<boolean> {
  const normalized = rawEmail.trim().toLowerCase();
  const admin = getSupabaseAdmin();

  if (!admin) {
    console.warn('[check-email] Supabase admin client not configured. SUPABASE_SERVICE_ROLE_KEY missing.');
    throw new AuthCheckError('ADMIN_CLIENT_UNAVAILABLE', 'Supabase admin client not available');
  }

  const lookupPromise = (async (): Promise<boolean> => {
    // Authoritative check via Supabase Auth Admin listUsers (bounded search)
    try {
      let page = 1;
      const perPage = 100;
      const maxPages = 10; // bounded to max 1,000 users

      while (page <= maxPages) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) {
          throw error;
        }

        const users = data?.users || [];
        for (const u of users) {
          if (u.email && u.email.trim().toLowerCase() === normalized) {
            return true;
          }
          const identities = (u as any).identities || [];
          for (const ident of identities) {
            const identEmail = ident.email || ident.identity_data?.email;
            if (identEmail && String(identEmail).trim().toLowerCase() === normalized) {
              return true;
            }
          }
        }

        if (users.length < perPage) {
          return false;
        }

        if (typeof data.total === 'number' && page * perPage >= data.total) {
          return false;
        }

        page++;
      }

      return false;
    } catch (err: any) {
      console.error('[check-email] listUsers check error:', err?.message || err);
      throw new AuthCheckError('LOOKUP_FAILED', 'Failed to query users from Supabase');
    }
  })();

  // Enforce an explicit server-side timeout so requests never hang indefinitely
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new AuthCheckError('LOOKUP_TIMEOUT', `Email check timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });

  return Promise.race([lookupPromise, timeoutPromise]);
}

