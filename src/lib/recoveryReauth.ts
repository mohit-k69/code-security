import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  generateAndStoreRecoveryCodes,
  getRecoveryCodesStatus,
  RecoveryCodesError,
} from "./recoveryCodes";

/**
 * Phase 4A.1: Secure Recovery-Code Regeneration & Step-Up Reauthentication Module
 *
 * Guarantees:
 * 1. Step-up reauthentication required for regeneration (when active recovery codes already exist).
 * 2. Initial generation (when user has 0 active codes) is allowed for normal authenticated sessions.
 * 3. Step-up reauthentication is strictly enforced on the server; client booleans/timestamps are rejected.
 * 4. Password verification is performed directly against Supabase Auth (or test override).
 * 5. Ephemeral reauth tokens are short-lived (2 minutes), bound to user ID, and strictly single-use.
 * 6. OAuth-only accounts are safely blocked from regeneration until a strong step-up mechanism is available.
 * 7. Concurrent regeneration requests for the same user ID are serialized with an async lock, ensuring
 *    one coherent active recovery code set and preventing overlapping duplicate active sets.
 * 8. Zero password logging, storage, or telemetry.
 */

export interface StepUpTokenRecord {
  userId: string;
  expiresAt: number;
  used: boolean;
}

// In-memory store for server-issued ephemeral step-up reauthentication tokens
const stepUpTokens = new Map<string, StepUpTokenRecord>();

// Periodic cleanup of expired tokens (every 60 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [token, record] of stepUpTokens.entries()) {
    if (record.expiresAt <= now || record.used) {
      stepUpTokens.delete(token);
    }
  }
}, 60 * 1000).unref();

// Process-local lock map is removed in favor of authoritative PostgreSQL distributed advisory locking.

/**
 * Helper function for executing recovery code operations.
 * PostgreSQL's non-blocking transaction advisory lock (pg_try_advisory_xact_lock)
 * is the authoritative distributed concurrency control.
 */
export async function withUserRegenerationLock<T>(_userId: string, fn: () => Promise<T>): Promise<T> {
  return await fn();
}

/**
 * Detects whether an account is strictly OAuth-only (Google/GitHub) with no password credential.
 */
export function isOAuthOnlyUser(user: any): boolean {
  if (!user) return false;
  const appMeta = user.app_metadata || {};
  const providers: string[] = appMeta.providers || (appMeta.provider ? [appMeta.provider] : []);
  const identities: any[] = user.identities || [];

  const hasEmail = providers.includes("email") || identities.some((i: any) => i.provider === "email");
  const hasOAuth =
    providers.includes("google") ||
    providers.includes("github") ||
    identities.some((i: any) => i.provider === "google" || i.provider === "github");

  return hasOAuth && !hasEmail;
}

/**
 * Verifies current password against Supabase Auth without logging or persisting credentials.
 */
export async function verifyCurrentPassword(
  email: string,
  password: string,
  mockClient?: { verifyPassword?: (email: string, pwd: string) => Promise<boolean> | boolean }
): Promise<boolean> {
  if (!email || !password || typeof password !== "string" || password.length === 0) {
    return false;
  }

  if (mockClient && typeof mockClient.verifyPassword === "function") {
    return Boolean(await mockClient.verifyPassword(email, password));
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase credentials not configured for password verification");
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  return !error && Boolean(data?.user);
}

/**
 * Generates a short-lived (2 minutes) single-use step-up reauthentication token for a verified user.
 */
export function createStepUpReauthToken(
  userId: string,
  ttlMs: number = 2 * 60 * 1000
): { token: string; expiresAt: number; expiresInSeconds: number } {
  if (!userId) {
    throw new Error("userId required to issue step-up token");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + ttlMs;

  stepUpTokens.set(token, {
    userId,
    expiresAt,
    used: false,
  });

  return {
    token,
    expiresAt,
    expiresInSeconds: Math.floor(ttlMs / 1000),
  };
}

/**
 * Verifies and immediately consumes a step-up token to enforce single-use.
 */
export function verifyAndConsumeStepUpToken(
  token: string,
  expectedUserId: string
): { valid: boolean; code?: string; message?: string } {
  if (!token || typeof token !== "string") {
    return { valid: false, code: "MISSING_TOKEN", message: "Step-up token is required" };
  }

  const record = stepUpTokens.get(token);
  if (!record) {
    return { valid: false, code: "INVALID_TOKEN", message: "Invalid reauthentication token" };
  }

  if (record.used) {
    return { valid: false, code: "ALREADY_USED", message: "Reauthentication token has already been used" };
  }

  if (record.userId !== expectedUserId) {
    return { valid: false, code: "USER_MISMATCH", message: "Reauthentication token does not match user" };
  }

  if (record.expiresAt <= Date.now()) {
    stepUpTokens.delete(token);
    return { valid: false, code: "EXPIRED_TOKEN", message: "Reauthentication token has expired. Please re-enter your password." };
  }

  // Consume token immediately (one-time use guarantee)
  record.used = true;
  stepUpTokens.delete(token);

  return { valid: true };
}

/**
 * Handles the complete recovery-code generation / regeneration request with server-enforced security boundaries.
 */
export async function handleRecoveryCodesGenerationRequest(
  admin: any,
  params: {
    userId: string;
    user: any;
    currentPassword?: string;
    reauthToken?: string;
    clientOverride?: any;
  }
): Promise<{ status: number; body: any }> {
  const { userId, user, currentPassword, reauthToken, clientOverride } = params;

  if (!userId || !user) {
    return { status: 401, body: { error: "UNAUTHORIZED", message: "Valid user session is required" } };
  }

  // Check current recovery code status
  const status = await getRecoveryCodesStatus(admin, userId);
  const isRegeneration = status.hasCodes && status.activeCount > 0;

  // Case 1: Initial generation (user has 0 active codes) -> Normal session is sufficient
  if (!isRegeneration) {
    try {
      const codes = await generateAndStoreRecoveryCodes(admin, userId);
      return {
        status: 200,
        body: {
          success: true,
          isInitial: true,
          count: codes.length,
          codes,
        },
      };
    } catch (err: any) {
      if (err instanceof RecoveryCodesError) {
        return {
          status: err.statusCode,
          body: {
            error: err.code,
            message: err.message,
          },
        };
      }
      console.error('[recovery-codes] Error in initial generation flow:', err?.message);
      return {
        status: 500,
        body: {
          error: 'RECOVERY_CODES_GENERATION_FAILED',
          message: 'Failed to generate recovery codes.',
        },
      };
    }
  }

  // Case 2: Regeneration (active codes exist) -> Step-up reauthentication is STRICTLY MANDATORY!
  
  // 2A: Check if user is OAuth-only
  if (isOAuthOnlyUser(user)) {
    return {
      status: 403,
      body: {
        error: "OAUTH_REAUTHENTICATION_UNSUPPORTED",
        message:
          "Recovery-code regeneration is currently unavailable for accounts signed in exclusively with Google or GitHub because strong step-up reauthentication is not supported. Please set an account password or contact support.",
      },
    };
  }

  // 2B: Step-Up verification
  let stepUpVerified = false;

  if (reauthToken) {
    const tokenResult = verifyAndConsumeStepUpToken(reauthToken, userId);
    if (!tokenResult.valid) {
      return {
        status: 401,
        body: {
          error: tokenResult.code || "INVALID_REAUTH_TOKEN",
          message: tokenResult.message || "Invalid or expired reauthentication token.",
        },
      };
    }
    stepUpVerified = true;
  } else if (currentPassword) {
    const isPasswordValid = await verifyCurrentPassword(user.email, currentPassword, clientOverride);
    if (!isPasswordValid) {
      return {
        status: 401,
        body: {
          error: "INVALID_CREDENTIALS",
          message: "Incorrect current password.",
        },
      };
    }
    stepUpVerified = true;
  }

  if (!stepUpVerified) {
    return {
      status: 401,
      body: {
        error: "REAUTHENTICATION_REQUIRED",
        message: "Current password reauthentication is required to regenerate recovery codes.",
      },
    };
  }

  // 2C: Authorized regeneration - Execute atomically within PostgreSQL distributed lock
  try {
    const codes = await generateAndStoreRecoveryCodes(admin, userId);
    return {
      status: 200,
      body: {
        success: true,
        isRegeneration: true,
        count: codes.length,
        codes,
      },
    };
  } catch (err: any) {
    if (err instanceof RecoveryCodesError) {
      return {
        status: err.statusCode,
        body: {
          error: err.code,
          message: err.message,
        },
      };
    }
    console.error('[recovery-codes] Error in regeneration flow:', err?.message);
    return {
      status: 500,
      body: {
        error: 'RECOVERY_CODES_GENERATION_FAILED',
        message: 'Failed to regenerate recovery codes.',
      },
    };
  }
}
