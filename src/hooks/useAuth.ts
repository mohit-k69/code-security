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
    // If the URL contains an OAuth callback payload, delay removing the loading screen
    // until onAuthStateChange has a chance to parse it and fire the SIGNED_IN event.
    const isOAuthCallback = window.location.hash.includes('access_token=') || window.location.hash.includes('error=');

    supabase.auth.getSession().then(({ data: { session } }) => {
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
      }
      if (!isOAuthCallback) {
        setIsInitializing(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // If we are in an OAuth popup, notify parent and close
      if (window.opener) {
        if (session?.provider_token) {
          try {
            await supabase.functions.invoke('store-provider-token', {
              body: { 
                providerToken: session.provider_token,
                providerRefreshToken: session.provider_refresh_token
              }
            });
          } catch (err) {
            console.error('Failed to trigger token storage in popup:', err);
          }
        }
        const workflow = new URLSearchParams(window.location.search).get('workflow');
        window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', workflow }, '*');
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

    return () => subscription.unsubscribe();
  }, []);

  return { user, setUser, isInitializing, providerTokenSetupError, retryProviderTokenSetup };
}
