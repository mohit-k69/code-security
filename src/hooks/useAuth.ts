import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface User {
  name: string;
  email: string;
  avatar?: string;
  created_at?: string;
  last_name_updated_at?: string;
  last_password_updated_at?: string;
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
    const hasCode = searchParams.has('code');
    const hasToken = window.location.hash.includes('access_token=');
    const hasError = searchParams.has('error') || window.location.hash.includes('error=');
    const isOAuthCallback = hasCode || hasToken || hasError;

    const syncSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const meta = session.user.user_metadata;
          setUser({
            name: meta?.full_name || meta?.first_name || session.user.email?.split('@')[0] || 'User',
            email: session.user.email || '',
            avatar: meta?.avatar_url,
            created_at: session.user.created_at,
            last_name_updated_at: meta?.last_name_updated_at,
            last_password_updated_at: meta?.last_password_updated_at,
          });
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
        const meta = session.user.user_metadata;
        setUser({
          name: meta?.full_name || meta?.first_name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || '',
          avatar: meta?.avatar_url,
          created_at: session.user.created_at,
          last_name_updated_at: meta?.last_name_updated_at,
          last_password_updated_at: meta?.last_password_updated_at,
        });

        try {
          authChannel?.postMessage({ type: 'AUTH_STATE_CHANGED' });
        } catch {}

        // Securely capture the provider token immediately after the OAuth redirect
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
          } catch (err: any) {
            console.error('Failed to trigger token storage:', err);
            setProviderTokenSetupError('GitHub was connected, but setup could not be completed due to a network error.');
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
