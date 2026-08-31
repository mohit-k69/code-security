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
  authProvider?: 'email' | 'github';
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
      const cleanUrl = window.location.pathname + (window.location.search.includes('workflow=github') ? '?workflow=github' : '');
      window.history.replaceState({}, document.title, cleanUrl);

      const isAccessDenied = oauthError.toLowerCase().includes('denied') || oauthError.toLowerCase().includes('access_denied');
      const userFriendlyError = isAccessDenied 
        ? 'GitHub authorization was cancelled.'
        : `GitHub connection error: ${oauthError}`;

      window.dispatchEvent(new CustomEvent('codevibe_github_oauth_error', { detail: { message: userFriendlyError } }));
    }

    const syncSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          console.log('[GITHUB_OAUTH] SESSION_AFTER_CALLBACK', {
            source: 'syncSession',
            hasSession: true,
            userId: session.user.id,
            email: session.user.email,
            hasProviderToken: Boolean(session.provider_token)
          });

          const meta = session.user.user_metadata;
          let identities = session.user.identities || [];
          let isGithubLinked = Boolean(
            session.user.app_metadata?.providers?.includes('github') ||
            session.user.app_metadata?.provider === 'github' ||
            identities.some((id: any) => id.provider === 'github')
          );

          let fetchedUserData: any = null;
          if (!isGithubLinked || identities.length === 0) {
            try {
              const { data: userData } = await supabase.auth.getUser();
              if (userData?.user) {
                fetchedUserData = userData.user;
                if (userData.user.identities) {
                  identities = userData.user.identities;
                }
                isGithubLinked = Boolean(
                  userData.user.app_metadata?.providers?.includes('github') ||
                  userData.user.app_metadata?.provider === 'github' ||
                  identities.some((id: any) => id.provider === 'github')
                );
              }
            } catch {}
          }

          // Determine primary authentication provider:
          // A user who authenticated via "Continue with GitHub" has:
          //   - app_metadata.provider === 'github'
          //   - only 'github' in app_metadata.providers (no 'email' provider)
          //   - NO identity with provider === 'email'
          // An email/password user has:
          //   - app_metadata.provider === 'email' OR
          //   - app_metadata.providers contains 'email' OR
          //   - an identity with provider === 'email'
          const hasEmailIdentity = identities.some((id: any) => id.provider === 'email');
          const hasEmailProvider = session.user.app_metadata?.providers?.includes('email');
          const isPrimaryEmailProvider = session.user.app_metadata?.provider === 'email';
          
          const isPrimaryEmailUser = isPrimaryEmailProvider || hasEmailIdentity || hasEmailProvider;
          const authProvider: 'email' | 'github' = isPrimaryEmailUser ? 'email' : 'github';

          const githubIdentity = identities.find((id: any) => id.provider === 'github');
          const githubUsername = githubIdentity?.identity_data?.user_name ||
            githubIdentity?.identity_data?.preferred_username ||
            session.user.user_metadata?.user_name ||
            session.user.user_metadata?.preferred_username ||
            fetchedUserData?.user_metadata?.user_name ||
            fetchedUserData?.user_metadata?.preferred_username;

          console.log('[AUTH_DIAGNOSTIC]', {
            source: 'syncSession',
            userId: session.user.id,
            app_metadata_provider: session.user.app_metadata?.provider,
            app_metadata_providers: session.user.app_metadata?.providers,
            identities: identities.map((id: any) => ({
              provider: id.provider,
              id: id.id
            })),
            calculated_authProvider: authProvider,
            isGithubLinked,
            showSwitchAccount_candidate: isGithubLinked && authProvider !== 'github'
          });

          setUser({
            id: session.user.id,
            name: meta?.full_name || meta?.first_name || session.user.email?.split('@')[0] || 'User',
            email: session.user.email || '',
            avatar: meta?.avatar_url,
            created_at: session.user.created_at,
            last_name_updated_at: meta?.last_name_updated_at,
            last_password_updated_at: meta?.last_password_updated_at,
            isGithubLinked,
            githubUsername,
            authProvider,
          });

          console.log('[GITHUB_OAUTH] PROVIDER_TOKEN_DETECTED', {
            source: 'syncSession',
            hasProviderToken: Boolean(session.provider_token),
            hasRefreshToken: Boolean(session.provider_refresh_token)
          });

          if (session.provider_token) {
            try {
              const { error, data } = await supabase.functions.invoke('store-provider-token', {
                body: { 
                  providerToken: session.provider_token,
                  providerRefreshToken: session.provider_refresh_token
                }
              });
              console.log('[GITHUB_OAUTH] TOKEN_STORAGE_RESULT', { source: 'syncSession', data, error });
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              setProviderTokenSetupError(null);
              window.dispatchEvent(new CustomEvent('codevibe_github_connected'));
            } catch (err: any) {
              console.error('Failed to trigger token storage from syncSession:', err);
              console.log('[GITHUB_OAUTH] TOKEN_STORAGE_RESULT', { source: 'syncSession', error: err });
              setProviderTokenSetupError('GitHub was connected, but token storage failed. Please try again.');
            }
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Session sync error:', err);
      } finally {
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

      if (session?.user) {
        console.log('[GITHUB_OAUTH] SESSION_AFTER_CALLBACK', {
          source: 'onAuthStateChange',
          event: _event,
          hasSession: true,
          userId: session.user.id,
          email: session.user.email,
          hasProviderToken: Boolean(session.provider_token)
        });

        const meta = session.user.user_metadata;
        const identities = session.user.identities || [];
        let isGithubLinked = Boolean(
          session.user.app_metadata?.providers?.includes('github') ||
          session.user.app_metadata?.provider === 'github' ||
          identities.some((id: any) => id.provider === 'github')
        );

        if (!isGithubLinked && session.provider_token) {
          isGithubLinked = true;
        }

        // Determine primary authentication provider:
        const hasEmailIdentity = identities.some((id: any) => id.provider === 'email');
        const hasEmailProvider = session.user.app_metadata?.providers?.includes('email');
        const isPrimaryEmailProvider = session.user.app_metadata?.provider === 'email';
        
        const isPrimaryEmailUser = isPrimaryEmailProvider || hasEmailIdentity || hasEmailProvider;
        const authProvider: 'email' | 'github' = isPrimaryEmailUser ? 'email' : 'github';

        const githubIdentity = identities.find((id: any) => id.provider === 'github');
        const githubUsername = githubIdentity?.identity_data?.user_name ||
          githubIdentity?.identity_data?.preferred_username ||
          session.user.user_metadata?.user_name ||
          session.user.user_metadata?.preferred_username;

        console.log('[AUTH_DIAGNOSTIC]', {
          source: 'onAuthStateChange',
          userId: session.user.id,
          app_metadata_provider: session.user.app_metadata?.provider,
          app_metadata_providers: session.user.app_metadata?.providers,
          identities: identities.map((id: any) => ({
            provider: id.provider,
            id: id.id
          })),
          calculated_authProvider: authProvider,
          isGithubLinked,
          showSwitchAccount_candidate: isGithubLinked && authProvider !== 'github'
        });

        setUser({
          id: session.user.id,
          name: meta?.full_name || meta?.first_name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || '',
          avatar: meta?.avatar_url,
          created_at: session.user.created_at,
          last_name_updated_at: meta?.last_name_updated_at,
          last_password_updated_at: meta?.last_password_updated_at,
          isGithubLinked,
          githubUsername,
          authProvider,
        });

        try {
          authChannel?.postMessage({ type: 'AUTH_STATE_CHANGED' });
        } catch {}

        console.log('[GITHUB_OAUTH] PROVIDER_TOKEN_DETECTED', {
          source: 'onAuthStateChange',
          hasProviderToken: Boolean(session.provider_token),
          hasRefreshToken: Boolean(session.provider_refresh_token)
        });

        // Securely capture the provider token immediately after the OAuth redirect
        if (session.provider_token) {
          try {
            const { error, data } = await supabase.functions.invoke('store-provider-token', {
              body: { 
                providerToken: session.provider_token,
                providerRefreshToken: session.provider_refresh_token
              }
            });
            console.log('[GITHUB_OAUTH] TOKEN_STORAGE_RESULT', { source: 'onAuthStateChange', data, error });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            setProviderTokenSetupError(null);
            window.dispatchEvent(new CustomEvent('codevibe_github_connected'));
          } catch (err: any) {
            console.error('Failed to trigger token storage:', err);
            console.log('[GITHUB_OAUTH] TOKEN_STORAGE_RESULT', { source: 'onAuthStateChange', error: err });
            setProviderTokenSetupError('GitHub was connected, but token storage failed. Please try again.');
          }
        }
      } else {
        setUser(null);
      }
      
      // Stop showing the loading screen once auth state is settled
      setIsInitializing(false);
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('storage', handleStorage);
      if (authChannel) authChannel.close();
    };
  }, []);

  return { user, setUser, isInitializing, providerTokenSetupError, retryProviderTokenSetup };
}
