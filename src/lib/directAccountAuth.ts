/**
 * Direct Account Authentication Helpers
 *
 * Implements low-friction, direct authentication for remembered accounts.
 *
 * SECURITY INVARIANTS:
 * 1. Prior Session Termination: Confirms current session is terminated (or forces signOut)
 *    before initiating any new authentication.
 * 2. Authenticated Session Proof: Never treats remembered metadata as proof of authentication;
 *    the account only becomes authenticated when Supabase returns a valid authenticated session.
 * 3. Credential Safety: Never stores passwords, access tokens, refresh tokens, or secrets.
 * 4. Anti-Enumeration: Generic error on incorrect password without exposing account existence.
 * 5. No Automatic Account Creation for Remembered Email: Only calls signInWithPassword, never signUp.
 */

import { supabase } from './supabase';
import { saveRememberedAccount } from './accountSwitcher';

export interface DirectAuthResult {
  success: boolean;
  user?: any;
  error?: string;
}

/**
 * Ensures the previous Supabase session is completely terminated.
 * If a session is unexpectedly still lingering, signs out and confirms session is null.
 */
export async function confirmSessionTerminated(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      console.warn('[DirectAuth] Lingering session detected; terminating before new auth...');
      await supabase.auth.signOut();
      const { data: { session: postSession } } = await supabase.auth.getSession();
      return postSession === null;
    }
    return true;
  } catch (err) {
    console.error('[DirectAuth] Error confirming session termination:', err);
    return false;
  }
}

/**
 * Initiates direct Google OAuth authentication.
 *
 * Low-Friction Behavior:
 * - When `accountEmail` is provided, passes `login_hint: accountEmail` and omits `prompt: 'select_account'`.
 *   This allows Google to authenticate with the existing Google session in the browser with minimum
 *   user interaction (or silently if already signed in on Google).
 * - When no `accountEmail` is provided (e.g. "Use another account" -> Google), passes `prompt: 'select_account'`.
 */
export async function initiateGoogleDirectAuth(accountEmail?: string): Promise<DirectAuthResult> {
  try {
    // 1. Confirm session is terminated
    const isTerminated = await confirmSessionTerminated();
    if (!isTerminated) {
      return { success: false, error: 'Could not terminate previous session. Please try again.' };
    }

    const queryParams: Record<string, string> = {
      access_type: 'offline',
    };

    if (accountEmail && accountEmail.trim()) {
      queryParams.login_hint = accountEmail.trim().toLowerCase();
    } else {
      queryParams.prompt = 'select_account';
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true,
        queryParams,
      },
    });

    if (error) throw error;

    if (data?.url) {
      if (typeof window !== 'undefined' && window.self !== window.top) {
        const popup = window.open(data.url, 'oauth_popup', 'width=500,height=650');
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.location.assign(data.url);
        }
      } else if (typeof window !== 'undefined') {
        window.location.assign(data.url);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('[DirectAuth] Google OAuth error:', err);
    let message = err.message || 'Failed to authenticate with Google. Please try again.';
    if (message.toLowerCase().includes('popup')) {
      message = 'Popup was blocked by your browser. Please allow popups or open the app in a new tab.';
    }
    return { success: false, error: message };
  }
}

/**
 * Initiates direct GitHub OAuth authentication.
 */
export async function initiateGithubDirectAuth(accountEmail?: string): Promise<DirectAuthResult> {
  try {
    // 1. Confirm session is terminated
    const isTerminated = await confirmSessionTerminated();
    if (!isTerminated) {
      return { success: false, error: 'Could not terminate previous session. Please try again.' };
    }

    const queryParams: Record<string, string> = {
      prompt: 'consent',
    };

    if (accountEmail && accountEmail.trim()) {
      queryParams.login = accountEmail.trim().toLowerCase();
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
        scopes: 'repo read:user user:email',
        skipBrowserRedirect: true,
        queryParams,
      },
    });

    if (error) throw error;

    if (data?.url) {
      if (typeof window !== 'undefined' && window.self !== window.top) {
        const popup = window.open(data.url, 'oauth_popup', 'width=500,height=650');
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.location.assign(data.url);
        }
      } else if (typeof window !== 'undefined') {
        window.location.assign(data.url);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('[DirectAuth] GitHub OAuth error:', err);
    let message = err.message || 'Failed to authenticate with GitHub. Please try again.';
    if (message.toLowerCase().includes('popup')) {
      message = 'Popup was blocked by your browser. Please allow popups or open the app in a new tab.';
    }
    return { success: false, error: message };
  }
}

/**
 * Directly authenticates a remembered email account using password.
 *
 * SECURITY INVARIANTS:
 * - NEVER stores the password.
 * - NEVER creates a new account for a remembered email (only signInWithPassword).
 * - Shows generic authentication error if incorrect password.
 */
export async function authenticateEmailDirect(
  email: string,
  password: string
): Promise<DirectAuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return { success: false, error: 'Please enter your password.' };
  }

  try {
    // 1. Confirm session is terminated before new login
    const isTerminated = await confirmSessionTerminated();
    if (!isTerminated) {
      return { success: false, error: 'Could not terminate previous session. Please try again.' };
    }

    // 2. Perform signInWithPassword ONLY
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.user || !data.session) {
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
          return { success: false, error: 'Please confirm your email address before signing in.' };
        }
        if (msg.includes('too many requests') || msg.includes('rate limit')) {
          return { success: false, error: 'Too many attempts. Please wait a moment and try again.' };
        }
      }
      return {
        success: false,
        error: "We couldn't sign you in with those details. Check your password and try again.",
      };
    }

    // 3. Update remembered account record with provider: 'email'
    saveRememberedAccount({
      email: normalizedEmail,
      name:
        data.user.user_metadata?.full_name ||
        data.user.user_metadata?.name ||
        data.user.user_metadata?.first_name ||
        normalizedEmail.split('@')[0],
      avatar: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture,
      provider: 'email',
    });

    return {
      success: true,
      user: {
        id: data.user.id,
        name:
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          data.user.user_metadata?.first_name ||
          normalizedEmail.split('@')[0],
        email: data.user.email || normalizedEmail,
        avatar: data.user.user_metadata?.avatar_url || data.user.user_metadata?.picture,
        authProvider: 'email',
      },
    };
  } catch (err: any) {
    console.error('[DirectAuth] Email sign-in unexpected error:', err);
    return {
      success: false,
      error: "We couldn't sign you in with those details. Check your password and try again.",
    };
  }
}
