import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  created_at?: string;
  last_name_updated_at?: string;
  last_password_updated_at?: string;
  isGithubLinked?: boolean;
  githubUsername?: string;
  authProvider?: 'email' | 'github' | 'google';
}

export function isOAuthUser(user: any, identities: any[] = []): boolean {
  if (!user) return false;
  const primaryProvider = user.app_metadata?.provider;
  if (primaryProvider === 'google' || primaryProvider === 'github') return true;

  const providers: string[] = user.app_metadata?.providers || [];
  if (providers.includes('google') || providers.includes('github')) return true;

  const ids = identities.length > 0 ? identities : (user.identities || []);
  if (ids.some((id: any) => id.provider === 'google' || id.provider === 'github')) {
    return true;
  }

  return false;
}

function resolveAuthProvider(
  user: any,
  fetchedUserData: any,
  identities: any[]
): 'email' | 'github' | 'google' | undefined {
  const primaryProvider =
    user.app_metadata?.provider ||
    fetchedUserData?.app_metadata?.provider;

  const providers: string[] = [
    ...(user.app_metadata?.providers || []),
    ...(fetchedUserData?.app_metadata?.providers || [])
  ];

  const hasGoogleIdentity = identities.some((id: any) => id.provider === 'google');
  const hasGithubIdentity = identities.some((id: any) => id.provider === 'github');
  const hasEmailIdentity = identities.some((id: any) => id.provider === 'email');

  if (primaryProvider === 'google' || (hasGoogleIdentity && !hasGithubIdentity)) {
    return 'google';
  }
  if (primaryProvider === 'github' || (hasGithubIdentity && !hasGoogleIdentity)) {
    return 'github';
  }
  if (hasGoogleIdentity && hasGithubIdentity) {
    if (primaryProvider === 'google' || providers[0] === 'google') return 'google';
    return 'github';
  }

  if (primaryProvider === 'email' || hasEmailIdentity || providers.includes('email')) {
    return 'email';
  }

  if (providers.includes('google')) return 'google';
  if (providers.includes('github')) return 'github';

  return undefined;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [providerTokenSetupError, setProviderTokenSetupError] = useState<string | null>(null);

  const retryProviderTokenSetup = async () => {
    setProviderTokenSetupError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.provider_token) {
        const { error, data } = await supabase.functions.invoke('store-provider-token', {
          body: { 
            providerToken: session.provider_token,
            providerRefreshToken: session.provider_refresh_token
          }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        // Success: clear error and reload page to refresh github state
        window.location.reload();
      } else {
        // Token is lost from memory. We must unlink the identity so they can securely restart the flow without duplicate errors.
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const githubIdentity = user.identities?.find(id => id.provider === 'github');
          if (githubIdentity) {
            await supabase.auth.unlinkIdentity(githubIdentity);
          }
        }
        setProviderTokenSetupError('Session expired. Please click Reconnect GitHub to restart.');
      }
    } catch (err: any) {
      console.error('Failed to retry token storage:', err);
      setProviderTokenSetupError(err.message || 'Failed to complete GitHub setup.');
    }
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const oauthError = searchParams.get('error_description') || hashParams.get('error_description') || searchParams.get('error') || hashParams.get('error');

    if (window.location.search.includes('code=') || window.location.hash.includes('access_token=') || oauthError) {
      console.log('[GITHUB_OAUTH] CALLBACK_DETECTED', {
        search: window.location.search,
        hash: window.location.hash,
        oauthError
      });
    }

    if (oauthError) {
      const isGithubWorkflow = window.location.search.includes('workflow=github');
      const cleanUrl = window.location.pathname + (isGithubWorkflow ? '?workflow=github' : '');
      window.history.replaceState({}, document.title, cleanUrl);

      const isAccessDenied = oauthError.toLowerCase().includes('denied') || oauthError.toLowerCase().includes('access_denied');
      const userFriendlyError = isAccessDenied 
        ? (isGithubWorkflow ? 'GitHub authorization was cancelled.' : 'Sign-in was cancelled.')
        : (isGithubWorkflow ? `GitHub connection error: ${oauthError}` : `Authentication error: ${oauthError}`);

      if (isGithubWorkflow) {
        window.dispatchEvent(new CustomEvent('codevibe_github_oauth_error', { detail: { message: userFriendlyError } }));
      } else {
        window.dispatchEvent(new CustomEvent('codevibe_auth_error', { detail: { message: userFriendlyError } }));
      }
    }

    const handleSession = async (session: any, source: string) => {
      try {
        if (!session?.user) {
          setUser(null);
          return;
        }

        console.log('[AUTH] SESSION_RECEIVED', {
          source,
          userId: session.user.id,
          email: session.user.email,
          hasProviderToken: Boolean(session.provider_token)
        });

        const meta = session.user.user_metadata;
        let identities = session.user.identities || [];
        let isGithubLinked = Boolean(
          session.user.app_metadata?.providers?.includes('github') ||
          session.user.app_metadata?.provider === 'github' ||
          identities.some((id: any) => id.provider === 'github') ||
          session.provider_token
        );

        let fetchedUserData: any = null;
        if (!isGithubLinked || identities.length === 0 || !session.user.app_metadata?.provider) {
          try {
            const { data: userData } = await supabase.auth.getUser();
            if (userData?.user) {
              fetchedUserData = userData.user;
              if (userData.user.identities && userData.user.identities.length > 0) {
                identities = userData.user.identities;
              }
              isGithubLinked = Boolean(
                userData.user.app_metadata?.providers?.includes('github') ||
                userData.user.app_metadata?.provider === 'github' ||
                identities.some((id: any) => id.provider === 'github') ||
                session.provider_token
              );
            }
          } catch (e) {
            console.warn('[AUTH] Could not fetch extended user data:', e);
          }
        }

        // Determine if the user authenticated via an OAuth provider (Google or GitHub)
        const isOAuth =
          isOAuthUser(session.user, identities) ||
          (fetchedUserData ? isOAuthUser(fetchedUserData, identities) : false) ||
          Boolean(session.provider_token);

        // Resolve user email
        const userEmail =
          session.user.email ||
          meta?.email ||
          fetchedUserData?.email ||
          identities.find((id: any) => id.identity_data?.email)?.identity_data?.email ||
          '';

        if (isOAuth) {
          // Edge case: If an OAuth provider does not return an email, handle it gracefully rather than bypassing security
          if (!userEmail || userEmail.trim() === '') {
            console.warn('[AUTH] OAuth user has no email returned from provider.');
            await supabase.auth.signOut();
            setUser(null);
            const isGoogle = session.user.app_metadata?.provider === 'google' || identities.some((id: any) => id.provider === 'google');
            const providerName = isGoogle ? 'Google' : 'GitHub';
            const userFriendlyError = `Your ${providerName} account did not provide an email address. Please ensure an email is associated with your ${providerName} account and try again.`;
            window.dispatchEvent(new CustomEvent('codevibe_auth_error', { detail: { message: userFriendlyError } }));
            return;
          }

          // Google & GitHub OAuth users bypass the email verification screen and go directly into the app
        } else {
          // Email/password users: must have confirmed their email address before normal access
          const isEmailConfirmed = Boolean(
            session.user.email_confirmed_at ||
            session.user.confirmed_at ||
            fetchedUserData?.email_confirmed_at ||
            fetchedUserData?.confirmed_at
          );

          if (!isEmailConfirmed) {
            console.warn('[AUTH] Email/password account detected with unconfirmed email.');
            await supabase.auth.signOut();
            setUser(null);
            window.dispatchEvent(new CustomEvent('codevibe_auth_error', {
              detail: { message: 'Please confirm your email address before signing in.' }
            }));
            return;
          }
        }

        const authProvider = resolveAuthProvider(session.user, fetchedUserData, identities);

        const githubIdentity = identities.find((id: any) => id.provider === 'github');
        const githubUsername = githubIdentity?.identity_data?.user_name ||
          githubIdentity?.identity_data?.preferred_username ||
          meta?.user_name ||
          meta?.preferred_username ||
          fetchedUserData?.user_metadata?.user_name ||
          fetchedUserData?.user_metadata?.preferred_username;

        console.log('[AUTH_DIAGNOSTIC]', {
          source,
          userId: session.user.id,
          app_metadata_provider: session.user.app_metadata?.provider,
          app_metadata_providers: session.user.app_metadata?.providers,
          identities: identities.map((id: any) => ({
            provider: id.provider,
            id: id.id
          })),
          calculated_authProvider: authProvider,
          isOAuth,
          isGithubLinked,
        });

        setUser({
          id: session.user.id,
          name: meta?.full_name || meta?.name || meta?.first_name || userEmail.split('@')[0] || 'User',
          email: userEmail,
          avatar: meta?.avatar_url || meta?.picture,
          created_at: session.user.created_at,
          last_name_updated_at: meta?.last_name_updated_at,
          last_password_updated_at: meta?.last_password_updated_at,
          isGithubLinked,
          githubUsername,
          authProvider,
        });

        if (session.provider_token) {
          try {
            const { error, data } = await supabase.functions.invoke('store-provider-token', {
              body: { 
                providerToken: session.provider_token,
                providerRefreshToken: session.provider_refresh_token
              }
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            setProviderTokenSetupError(null);
            window.dispatchEvent(new CustomEvent('codevibe_github_connected'));
          } catch (err: any) {
            console.error('Failed to trigger token storage:', err);
            setProviderTokenSetupError('GitHub was connected, but token storage failed. Please try again.');
          }
        }
      } catch (err) {
        console.error('Session handling error:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    const syncSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await handleSession(session, 'syncSession');
      } catch (err) {
        console.error('Session sync error:', err);
        setIsInitializing(false);
      }
    };

    syncSession();

    // BroadcastChannel for reliable cross-tab/popup auth sync
    let authChannel: BroadcastChannel | null = null;
    try {
      authChannel = new BroadcastChannel('codevibe_auth_channel');
      authChannel.onmessage = (msg) => {
        if (msg.data?.type === 'AUTH_STATE_CHANGED') {
          syncSession();
        }
      };
    } catch {}

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'codevibe_auth_event' || e.key?.startsWith('sb-')) {
        syncSession();
      }
    };
    window.addEventListener('storage', handleStorage);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // Clean up URL if returning from OAuth redirect
      if (window.location.search.includes('code=') || window.location.hash.includes('access_token=')) {
        const cleanUrl = window.location.pathname + (window.location.search.includes('workflow=github') ? '?workflow=github' : '');
        window.history.replaceState({}, document.title, cleanUrl);
      }

      // If we are in an OAuth popup, notify parent and close
      const isPopup = window.opener || window.name === 'oauth_popup';
      if (isPopup) {
        if (session?.provider_token) {
          try {
            await supabase.functions.invoke('store-provider-token', {
              body: { 
                providerToken: session.provider_token,
                providerRefreshToken: session.provider_refresh_token
              }
            });
          } catch (err) {
            console.error('Failed to trigger token storage from popup:', err);
          }
        }
        const workflow = new URLSearchParams(window.location.search).get('workflow');
        try {
          authChannel?.postMessage({ type: 'AUTH_STATE_CHANGED', workflow });
          localStorage.setItem('codevibe_auth_event', Date.now().toString());
        } catch {}

        if (window.opener) {
          try {
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', workflow }, '*');
          } catch {}
        }
        window.close();
        return;
      }

      await handleSession(session, 'onAuthStateChange');
    });

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'OAUTH_AUTH_SUCCESS' || e.data?.type === 'AUTH_STATE_CHANGED') {
        syncSession();
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('message', handleMessage);
      if (authChannel) authChannel.close();
    };
  }, []);

  return { user, setUser, isInitializing, providerTokenSetupError, retryProviderTokenSetup };
}
