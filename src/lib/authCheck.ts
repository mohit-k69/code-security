import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: '.env.local' });
dotenv.config();

let supabaseAdminClient: ReturnType<typeof createClient> | null = null;

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

export async function checkAuthEmailExists(rawEmail: string): Promise<boolean> {
  const normalized = rawEmail.trim().toLowerCase();
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn('[authCheck] Supabase admin client not configured. SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL missing.');
    return false;
  }

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
              const identEmail = (ident as any).email || ident.identity_data?.email;
              if (identEmail && String(identEmail).trim().toLowerCase() === normalized) {
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
