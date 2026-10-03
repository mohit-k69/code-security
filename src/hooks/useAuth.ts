import { useState, useEffect, useRef } from 'react';
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
  isGitlabLinked?: boolean;
  gitlabUsername?: string;
  isBitbucketLinked?: boolean;
  bitbucketUsername?: string;
  isAzureLinked?: boolean;
  azureUsername?: string;
  authProvider?: 'email' | 'github' | 'google' | 'gitlab' | 'bitbucket' | 'azure';
  recoveryPromptSeenAt?: string;
}

export function isOAuthUser(user: any, identities: any[] = []): boolean {
  if (!user) return false;
  const oauthProviders = ['google', 'github', 'gitlab', 'bitbucket', 'azure'];
  const primaryProvider = user.app_metadata?.provider;
  if (primaryProvider && oauthProviders.includes(primaryProvider)) return true;

  const providers: string[] = user.app_metadata?.providers || [];
  if (providers.some((p: string) => oauthProviders.includes(p))) return true;

  const ids = identities.length > 0 ? identities : (user.identities || []);
  if (ids.some((id: any) => oauthProviders.includes(id.provider))) {
    return true;
  }

  return false;
}

// Helper to resolve the OAuth provider from the explicit flow context (URL or session/local storage tracking)
// NOTE: Strictly avoids inferring from primary Supabase auth metadata and NEVER silently falls back to 'github'
export function resolveFlowProvider(
  explicitProvider?: string | null
): 'github' | 'gitlab' | 'bitbucket' | 'azure' | null {
  const validProviders: Array<'github' | 'gitlab' | 'bitbucket' | 'azure'> = [
    'github',
    'gitlab',
    'bitbucket',
    'azure'
  ];

  if (explicitProvider && validProviders.includes(explicitProvider.toLowerCase() as any)) {
    return explicitProvider.toLowerCase() as any;
  }

  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const workflow = searchParams.get('workflow') || hashParams.get('workflow');
    if (workflow && validProviders.includes(workflow.toLowerCase() as any)) {
      return workflow.toLowerCase() as any;
    }

    const sessionStored = window.sessionStorage?.getItem('cody_oauth_flow_provider');
    if (sessionStored && validProviders.includes(sessionStored.toLowerCase() as any)) {
      return sessionStored.toLowerCase() as any;
    }

    const localStored = window.localStorage?.getItem('cody_oauth_flow_provider');
    if (localStored && validProviders.includes(localStored.toLowerCase() as any)) {
      return localStored.toLowerCase() as any;
    }
  } catch {}

  // CRITICAL: NEVER silently fall back to 'github'!
  // A missing provider context must return null to prevent token misattribution.
  return null;
}

// Helper to safely clean OAuth callback URL parameters AFTER session is established
export function cleanOAuthCallbackUrl(workflowOverride?: string | null): void {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    const hasCallbackParams =
      searchParams.has('code') ||
      searchParams.has('error') ||
      searchParams.has('error_description') ||
      hashParams.has('access_token') ||
      hashParams.has('refresh_token') ||
      hashParams.has('provider_token') ||
      hashParams.has('error');

    if (!hasCallbackParams) return;

    const targetWorkflow =
      workflowOverride ||
      searchParams.get('workflow') ||
      hashParams.get('workflow') ||
      window.sessionStorage?.getItem('cody_oauth_flow_provider') ||
      window.localStorage?.getItem('cody_oauth_flow_provider');

    const cleanSearch = (targetWorkflow && ['github', 'gitlab', 'bitbucket', 'azure'].includes(targetWorkflow.toLowerCase()))
      ? `?workflow=${targetWorkflow.toLowerCase()}`
      : '';

    const cleanUrl = window.location.pathname + cleanSearch;
    window.history.replaceState({}, document.title, cleanUrl);
  } catch (err) {
    console.warn('[AUTH] URL cleanup error:', err);
  }
}

// Helper to authoritatively load linked provider identities from Supabase Auth
export async function loadLinkedProviderIdentities(): Promise<any[]> {
  try {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) {
      console.warn('[AUTH] Error loading user identities from getUserIdentities():', error);
      return [];
    }
    return data?.identities || [];
  } catch (err) {
    console.warn('[AUTH] Failed to invoke getUserIdentities():', err);
    return [];
  }
}

// Helper to extract linked provider statuses and usernames from authoritative identities
// Strictly avoids inferring provider-linked state from primary app_metadata.provider
export function extractLinkedProviders(identities: any[]) {
  const ids = Array.isArray(identities) ? identities : [];

  const githubIdentity = ids.find((id: any) => id.provider === 'github');
  const gitlabIdentity = ids.find((id: any) => id.provider === 'gitlab');
  const bitbucketIdentity = ids.find((id: any) => id.provider === 'bitbucket');
  const azureIdentity = ids.find((id: any) => id.provider === 'azure');

  const isGithubLinked = Boolean(githubIdentity);
  const isGitlabLinked = Boolean(gitlabIdentity);
  const isBitbucketLinked = Boolean(bitbucketIdentity);
  const isAzureLinked = Boolean(azureIdentity);

  const githubUsername = githubIdentity?.identity_data?.user_name ||
    githubIdentity?.identity_data?.preferred_username ||
    githubIdentity?.identity_data?.login;

  const gitlabUsername = gitlabIdentity?.identity_data?.user_name ||
    gitlabIdentity?.identity_data?.preferred_username ||
    gitlabIdentity?.identity_data?.name;

  const bitbucketUsername = bitbucketIdentity?.identity_data?.username ||
    bitbucketIdentity?.identity_data?.nickname ||
    bitbucketIdentity?.identity_data?.display_name;

  const azureUsername = azureIdentity?.identity_data?.name ||
    azureIdentity?.identity_data?.preferred_username;

  return {
    isGithubLinked,
    githubUsername,
    isGitlabLinked,
    gitlabUsername,
    isBitbucketLinked,
    bitbucketUsername,
    isAzureLinked,
    azureUsername,
  };
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
  const lastStoredTokenRef = useRef<string | null>(null);
  const isStoringTokenRef = useRef(false);
  const isOAuthCallbackPendingRef = useRef(false);

  const retryProviderTokenSetup = async (explicitProvider?: string) => {
    setProviderTokenSetupError(null);
    const provider = resolveFlowProvider(explicitProvider);
    if (!provider) {
      console.warn('[AUTH] Cannot retry token storage: flow provider context missing');
      return;
    }
    const providerName = provider === 'gitlab' ? 'GitLab'
      : provider === 'bitbucket' ? 'Bitbucket'
      : provider === 'azure' ? 'Azure DevOps'
      : 'GitHub';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      // 1. First test if a valid connection is ALREADY stored and working in the database
      if (accessToken) {
        try {
          const testFn = provider === 'gitlab' ? 'fetch-gitlab-projects'
            : provider === 'bitbucket' ? 'fetch-bitbucket-repos'
            : provider === 'azure' ? 'fetch-azure-repos'
            : 'fetch-github-repositories';

          const { data: repos, error: testErr } = await supabase.functions.invoke(testFn, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (!testErr && Array.isArray(repos)) {
            // Connection is already active and healthy! Clear error and trigger UI update
            setProviderTokenSetupError(null);
            try {
              const authIdentities = await loadLinkedProviderIdentities();
              if (Array.isArray(authIdentities) && authIdentities.length > 0) {
                const linked = extractLinkedProviders(authIdentities);
                setUser(prev => prev ? {
                  ...prev,
                  isGithubLinked: linked.isGithubLinked || (provider === 'github' ? true : prev.isGithubLinked),
                  githubUsername: linked.githubUsername || prev.githubUsername,
                  isGitlabLinked: linked.isGitlabLinked || (provider === 'gitlab' ? true : prev.isGitlabLinked),
                  gitlabUsername: linked.gitlabUsername || prev.gitlabUsername,
                  isBitbucketLinked: linked.isBitbucketLinked || (provider === 'bitbucket' ? true : prev.isBitbucketLinked),
                  bitbucketUsername: linked.bitbucketUsername || prev.bitbucketUsername,
                  isAzureLinked: linked.isAzureLinked || (provider === 'azure' ? true : prev.isAzureLinked),
                  azureUsername: linked.azureUsername || prev.azureUsername,
                } : null);
              } else {
                setUser(prev => prev ? {
                  ...prev,
                  isGithubLinked: provider === 'github' ? true : prev.isGithubLinked,
                  isGitlabLinked: provider === 'gitlab' ? true : prev.isGitlabLinked,
                  isBitbucketLinked: provider === 'bitbucket' ? true : prev.isBitbucketLinked,
                  isAzureLinked: provider === 'azure' ? true : prev.isAzureLinked,
                } : null);
              }
            } catch {}
            window.dispatchEvent(new CustomEvent(`codevibe_${provider}_connected`));
            return;
          }
        } catch {}
      }

      // 2. If session has provider_token, invoke store-provider-token with explicit Authorization header & provider
      if (session?.provider_token && accessToken) {
        const { error, data } = await supabase.functions.invoke('store-provider-token', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { 
            providerToken: session.provider_token,
            providerRefreshToken: session.provider_refresh_token,
            provider
          }
        });
        if (error) {
          let errorMsg = error.message;
          if (error.context) {
            try {
              const body = await error.context.json();
              if (body?.error) errorMsg = body.error;
            } catch {}
          }
          throw new Error(errorMsg);
        }
        if (data?.error) throw new Error(data.error);

        // Success: refresh authoritative identities, clear error and dispatch connected event
        try {
          const authIdentities = await loadLinkedProviderIdentities();
          if (Array.isArray(authIdentities) && authIdentities.length > 0) {
            const linked = extractLinkedProviders(authIdentities);
            setUser(prev => prev ? {
              ...prev,
              isGithubLinked: linked.isGithubLinked || (provider === 'github' ? true : prev.isGithubLinked),
              githubUsername: linked.githubUsername || prev.githubUsername,
              isGitlabLinked: linked.isGitlabLinked || (provider === 'gitlab' ? true : prev.isGitlabLinked),
              gitlabUsername: linked.gitlabUsername || prev.gitlabUsername,
              isBitbucketLinked: linked.isBitbucketLinked || (provider === 'bitbucket' ? true : prev.isBitbucketLinked),
              bitbucketUsername: linked.bitbucketUsername || prev.bitbucketUsername,
              isAzureLinked: linked.isAzureLinked || (provider === 'azure' ? true : prev.isAzureLinked),
              azureUsername: linked.azureUsername || prev.azureUsername,
            } : null);
          } else {
            setUser(prev => prev ? {
              ...prev,
              isGithubLinked: provider === 'github' ? true : prev.isGithubLinked,
              isGitlabLinked: provider === 'gitlab' ? true : prev.isGitlabLinked,
              isBitbucketLinked: provider === 'bitbucket' ? true : prev.isBitbucketLinked,
              isAzureLinked: provider === 'azure' ? true : prev.isAzureLinked,
            } : null);
          }
        } catch {}
        setProviderTokenSetupError(null);
        window.dispatchEvent(new CustomEvent(`codevibe_${provider}_connected`));
        return;
      }

      // 3. If neither worked, prompt re-authorization without destructively unlinking the identity
      setProviderTokenSetupError(`Please click Reconnect ${providerName} to re-authorize your account.`);
    } catch (err: any) {
      console.error(`Failed to retry ${providerName} token storage:`, err);
      setProviderTokenSetupError(err.message || `Failed to complete ${providerName} setup.`);
    }
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const oauthError = searchParams.get('error_description') || hashParams.get('error_description') || searchParams.get('error') || hashParams.get('error');

    // Latch in-flight OAuth callback detection at mount so it survives URL modification by Supabase PKCE exchange
    const initialHasCallback = Boolean(
      window.location.search.includes('code=') ||
      window.location.hash.includes('access_token=') ||
      searchParams.has('workflow') ||
      window.sessionStorage?.getItem('cody_oauth_flow_provider') ||
      window.localStorage?.getItem('cody_oauth_flow_provider')
    );
    if (initialHasCallback && !oauthError) {
      isOAuthCallbackPendingRef.current = true;
    }

    const hasPendingOAuthCallback = () => {
      try {
        const search = window.location.search;
        const hash = window.location.hash;
        if (search.includes('code=') || hash.includes('access_token=')) {
          return true;
        }
        return Boolean(isOAuthCallbackPendingRef.current);
      } catch {
        return false;
      }
    };

    if (window.location.search.includes('code=') || window.location.hash.includes('access_token=') || oauthError) {
      console.log('[GITHUB_OAUTH] CALLBACK_DETECTED', {
        search: window.location.search,
        hash: window.location.hash,
        oauthError
      });
    }

    if (oauthError) {
      isOAuthCallbackPendingRef.current = false;
      cleanOAuthCallbackUrl();

      const isAccessDenied = oauthError.toLowerCase().includes('denied') || oauthError.toLowerCase().includes('access_denied');
      const flowProv = resolveFlowProvider();
      const providerLabel = flowProv === 'gitlab' ? 'GitLab'
        : flowProv === 'bitbucket' ? 'Bitbucket'
        : flowProv === 'azure' ? 'Azure DevOps'
        : flowProv === 'github' ? 'GitHub'
        : 'Provider';
      const userFriendlyError = isAccessDenied 
        ? (`${providerLabel} authorization was cancelled.`)
        : (`${providerLabel} connection error: ${oauthError}`);

      if (flowProv === 'github') {
        window.dispatchEvent(new CustomEvent('codevibe_github_oauth_error', { detail: { message: userFriendlyError } }));
      } else {
        window.dispatchEvent(new CustomEvent('codevibe_auth_error', { detail: { message: userFriendlyError } }));
      }
    }

    // Helper to store provider token in background without blocking initial UI render
    const storeProviderTokenInBackground = async (session: any, explicitProvider?: string) => {
      if (!session?.provider_token || isStoringTokenRef.current) return;
      if (lastStoredTokenRef.current === session.provider_token) return;

      const provider = resolveFlowProvider(explicitProvider);
      if (!provider) {
        console.warn('[AUTH] Provider token present but flow provider could not be resolved. Skipping token persistence to prevent misattribution.');
        return;
      }

      console.log(`[OAUTH_DEBUG] provider=${provider} event=store_token_start has_session=${Boolean(session)} has_provider_token=true has_provider_refresh_token=${Boolean(session.provider_refresh_token)}`);

      isStoringTokenRef.current = true;
      lastStoredTokenRef.current = session.provider_token;

      try {
        const { error, data } = await supabase.functions.invoke('store-provider-token', {
          headers: session.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
          body: { 
            providerToken: session.provider_token,
            providerRefreshToken: session.provider_refresh_token,
            provider
          }
        });
        if (error) {
          let errorMsg = error.message;
          if (error.context) {
            try {
              const body = await error.context.json();
              if (body?.error) errorMsg = body.error;
            } catch {}
          }
          throw new Error(errorMsg);
        }
        if (data?.error) throw new Error(data.error);

        console.log(`[OAUTH_DEBUG] provider=${provider} store_provider_token=success oauth_connection_exists=true`);

        // After successful provider token persistence, refresh linked identities using getUserIdentities()
        try {
          const authIdentities = await loadLinkedProviderIdentities();
          console.log(`[OAUTH_DEBUG] provider=${provider} identities=${JSON.stringify(authIdentities.map((i: any) => i.provider))}`);
          if (Array.isArray(authIdentities) && authIdentities.length > 0) {
            const linked = extractLinkedProviders(authIdentities);
            setUser(prev => prev ? {
              ...prev,
              isGithubLinked: linked.isGithubLinked || (provider === 'github' ? true : prev.isGithubLinked),
              githubUsername: linked.githubUsername || prev.githubUsername,
              isGitlabLinked: linked.isGitlabLinked || (provider === 'gitlab' ? true : prev.isGitlabLinked),
              gitlabUsername: linked.gitlabUsername || prev.gitlabUsername,
              isBitbucketLinked: linked.isBitbucketLinked || (provider === 'bitbucket' ? true : prev.isBitbucketLinked),
              bitbucketUsername: linked.bitbucketUsername || prev.bitbucketUsername,
              isAzureLinked: linked.isAzureLinked || (provider === 'azure' ? true : prev.isAzureLinked),
              azureUsername: linked.azureUsername || prev.azureUsername,
            } : null);
          } else {
            setUser(prev => prev ? {
              ...prev,
              isGithubLinked: provider === 'github' ? true : prev.isGithubLinked,
              isGitlabLinked: provider === 'gitlab' ? true : prev.isGitlabLinked,
              isBitbucketLinked: provider === 'bitbucket' ? true : prev.isBitbucketLinked,
              isAzureLinked: provider === 'azure' ? true : prev.isAzureLinked,
            } : null);
          }
        } catch {}

        setProviderTokenSetupError(null);
        if (provider === 'gitlab') {
          window.dispatchEvent(new CustomEvent('codevibe_gitlab_connected'));
        } else if (provider === 'bitbucket') {
          window.dispatchEvent(new CustomEvent('codevibe_bitbucket_connected'));
        } else if (provider === 'azure') {
          window.dispatchEvent(new CustomEvent('codevibe_azure_connected'));
        } else {
          window.dispatchEvent(new CustomEvent('codevibe_github_connected'));
        }
        try {
          window.sessionStorage?.removeItem('cody_oauth_flow_provider');
          window.localStorage?.removeItem('cody_oauth_flow_provider');
        } catch {}
      } catch (err: any) {
        console.warn(`[OAUTH_DEBUG] provider=${provider} store_provider_token=failed`, err?.message || err);
        // Verify if a working connection is already present in oauth_connections before showing error
        if (session.access_token) {
          try {
            const testFn = provider === 'gitlab' ? 'fetch-gitlab-projects'
              : provider === 'bitbucket' ? 'fetch-bitbucket-repos'
              : provider === 'azure' ? 'fetch-azure-repos'
              : 'fetch-github-repositories';
            const { data: testRepos, error: testErr } = await supabase.functions.invoke(testFn, {
              headers: { Authorization: `Bearer ${session.access_token}` }
            });
            if (!testErr && Array.isArray(testRepos)) {
              setProviderTokenSetupError(null);
              try {
                const authIdentities = await loadLinkedProviderIdentities();
                if (Array.isArray(authIdentities) && authIdentities.length > 0) {
                  const linked = extractLinkedProviders(authIdentities);
                  setUser(prev => prev ? {
                    ...prev,
                    isGithubLinked: linked.isGithubLinked || (provider === 'github' ? true : prev.isGithubLinked),
                    githubUsername: linked.githubUsername || prev.githubUsername,
                    isGitlabLinked: linked.isGitlabLinked || (provider === 'gitlab' ? true : prev.isGitlabLinked),
                    gitlabUsername: linked.gitlabUsername || prev.gitlabUsername,
                    isBitbucketLinked: linked.isBitbucketLinked || (provider === 'bitbucket' ? true : prev.isBitbucketLinked),
                    bitbucketUsername: linked.bitbucketUsername || prev.bitbucketUsername,
                    isAzureLinked: linked.isAzureLinked || (provider === 'azure' ? true : prev.isAzureLinked),
                    azureUsername: linked.azureUsername || prev.azureUsername,
                  } : null);
                } else {
                  setUser(prev => prev ? {
                    ...prev,
                    isGithubLinked: provider === 'github' ? true : prev.isGithubLinked,
                    isGitlabLinked: provider === 'gitlab' ? true : prev.isGitlabLinked,
                    isBitbucketLinked: provider === 'bitbucket' ? true : prev.isBitbucketLinked,
                    isAzureLinked: provider === 'azure' ? true : prev.isAzureLinked,
                  } : null);
                }
              } catch {}
              if (provider === 'gitlab') {
                window.dispatchEvent(new CustomEvent('codevibe_gitlab_connected'));
              } else if (provider === 'bitbucket') {
                window.dispatchEvent(new CustomEvent('codevibe_bitbucket_connected'));
              } else if (provider === 'azure') {
                window.dispatchEvent(new CustomEvent('codevibe_azure_connected'));
              } else {
                window.dispatchEvent(new CustomEvent('codevibe_github_connected'));
              }
              return;
            }
          } catch {}
        }
        const providerName = provider === 'gitlab' ? 'GitLab'
          : provider === 'bitbucket' ? 'Bitbucket'
          : provider === 'azure' ? 'Azure DevOps'
          : 'GitHub';
        setProviderTokenSetupError(err.message || `${providerName} was connected, but token storage failed. Please try again.`);
      } finally {
        isStoringTokenRef.current = false;
      }
    };

    const handleSession = async (session: any, source: string) => {
      try {
        if (!session?.user) {
          // If returning from an OAuth callback and waiting for Supabase to exchange code,
          // do NOT prematurely mark initialization complete as unauthenticated!
          // Supabase's onAuthStateChange will fire momentarily once the code exchange completes.
          if ((hasPendingOAuthCallback() && source === 'syncSession') || (hasPendingOAuthCallback() && source === 'onAuthStateChange')) {
            console.log(`[AUTH] In-flight OAuth callback detected in URL (${source}), waiting for onAuthStateChange exchange...`);
            return;
          }

          setUser(null);
          setIsInitializing(false);
          return;
        }

        // Clean callback parameters from the URL safely now that session is successfully established
        if (hasPendingOAuthCallback()) {
          cleanOAuthCallbackUrl();
        }
        isOAuthCallbackPendingRef.current = false;

        console.log('[AUTH] SESSION_RECEIVED', {
          source,
          userId: session.user.id,
          email: session.user.email,
          hasProviderToken: Boolean(session.provider_token)
        });

        const meta = session.user.user_metadata;
        const identities = session.user.identities || [];
        const flowProvider = resolveFlowProvider();
        const sessionLinked = extractLinkedProviders(identities);

        const isGithubLinked = sessionLinked.isGithubLinked || Boolean(session.provider_token && flowProvider === 'github');
        const isGitlabLinked = sessionLinked.isGitlabLinked || Boolean(session.provider_token && flowProvider === 'gitlab');
        const isBitbucketLinked = sessionLinked.isBitbucketLinked || Boolean(session.provider_token && flowProvider === 'bitbucket');
        const isAzureLinked = sessionLinked.isAzureLinked || Boolean(session.provider_token && flowProvider === 'azure');

        // Determine if the user authenticated via an OAuth provider (Google or GitHub)
        const isOAuth = isOAuthUser(session.user, identities) || Boolean(session.provider_token);

        // Resolve user email
        const userEmail =
          session.user.email ||
          meta?.email ||
          identities.find((id: any) => id.identity_data?.email)?.identity_data?.email ||
          '';

        if (isOAuth) {
          // Edge case: If an OAuth provider does not return an email, handle it gracefully rather than bypassing security
          if (!userEmail || userEmail.trim() === '') {
            console.warn('[AUTH] OAuth user has no email returned from provider.');
            await supabase.auth.signOut();
            setUser(null);
            setIsInitializing(false);
            const isGoogle = session.user.app_metadata?.provider === 'google' || identities.some((id: any) => id.provider === 'google');
            const providerName = isGoogle ? 'Google' : 'GitHub';
            const userFriendlyError = `Your ${providerName} account did not provide an email address. Please ensure an email is associated with your ${providerName} account and try again.`;
            window.dispatchEvent(new CustomEvent('codevibe_auth_error', { detail: { message: userFriendlyError } }));
            return;
          }
        } else {
          // Email/password users: must have confirmed their email address before normal access
          const isEmailConfirmed = Boolean(
            session.user.email_confirmed_at ||
            session.user.confirmed_at
          );

          if (!isEmailConfirmed) {
            console.warn('[AUTH] Email/password account detected with unconfirmed email.');
            await supabase.auth.signOut();
            setUser(null);
            setIsInitializing(false);
            window.dispatchEvent(new CustomEvent('codevibe_auth_error', {
              detail: { message: 'Please confirm your email address before signing in.' }
            }));
            return;
          }
        }

        const authProvider = resolveAuthProvider(session.user, null, identities);

        // FAST-PATH: Set user immediately with session data and unblock initialization (instant load!)
        // Invariant: Never overwrite already-connected provider states back to false from a stale session object
        setUser(prev => ({
          id: session.user.id,
          name: meta?.full_name || meta?.name || meta?.first_name || userEmail.split('@')[0] || 'User',
          email: userEmail,
          avatar: meta?.avatar_url || meta?.picture,
          created_at: session.user.created_at,
          last_name_updated_at: meta?.last_name_updated_at,
          last_password_updated_at: meta?.last_password_updated_at,
          isGithubLinked: Boolean(isGithubLinked || prev?.isGithubLinked),
          githubUsername: sessionLinked.githubUsername || prev?.githubUsername,
          isGitlabLinked: Boolean(isGitlabLinked || prev?.isGitlabLinked),
          gitlabUsername: sessionLinked.gitlabUsername || prev?.gitlabUsername,
          isBitbucketLinked: Boolean(isBitbucketLinked || prev?.isBitbucketLinked),
          bitbucketUsername: sessionLinked.bitbucketUsername || prev?.bitbucketUsername,
          isAzureLinked: Boolean(isAzureLinked || prev?.isAzureLinked),
          azureUsername: sessionLinked.azureUsername || prev?.azureUsername,
          authProvider: authProvider || prev?.authProvider,
          recoveryPromptSeenAt: meta?.recovery_prompt_seen_at,
        }));

        // Unblock UI immediately so the user doesn't wait
        setIsInitializing(false);

        // Store provider token in background without blocking the UI
        if (session.provider_token) {
          storeProviderTokenInBackground(session, flowProvider || undefined);
        }

        // Authoritative user identity refresh using getUserIdentities():
        // Always query the server for fresh linked identities, and update state without reverting connected flags
        loadLinkedProviderIdentities().then(authIdentities => {
          if (Array.isArray(authIdentities) && authIdentities.length > 0) {
            const freshLinked = extractLinkedProviders(authIdentities);
            setUser(prev => {
              if (!prev) return null;
              return {
                ...prev,
                isGithubLinked: freshLinked.isGithubLinked || prev.isGithubLinked,
                githubUsername: freshLinked.githubUsername || prev.githubUsername,
                isGitlabLinked: freshLinked.isGitlabLinked || prev.isGitlabLinked,
                gitlabUsername: freshLinked.gitlabUsername || prev.gitlabUsername,
                isBitbucketLinked: freshLinked.isBitbucketLinked || prev.isBitbucketLinked,
                bitbucketUsername: freshLinked.bitbucketUsername || prev.bitbucketUsername,
                isAzureLinked: freshLinked.isAzureLinked || prev.isAzureLinked,
                azureUsername: freshLinked.azureUsername || prev.azureUsername,
              };
            });
          }
        }).catch(e => {
          console.warn('[AUTH] Background getUserIdentities sync error:', e);
        });
      } catch (err) {
        console.error('Session handling error:', err);
        setIsInitializing(false);
      }
    };

    const syncSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await handleSession(session, 'syncSession');
          return;
        }

        // If an OAuth callback resolution is in flight and in-memory session is not yet loaded,
        // check whether an active authenticated session exists in storage before awaiting onAuthStateChange
        if (isOAuthCallbackPendingRef.current) {
          try {
            for (let i = 0; i < window.localStorage.length; i++) {
              const key = window.localStorage.key(i);
              if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                const storedVal = window.localStorage.getItem(key);
                if (storedVal) {
                  const parsed = JSON.parse(storedVal);
                  if (parsed?.access_token && parsed?.refresh_token) {
                    const { data: recoveredData } = await supabase.auth.setSession({
                      access_token: parsed.access_token,
                      refresh_token: parsed.refresh_token,
                    });
                    if (recoveredData?.session?.user) {
                      await handleSession(recoveredData.session, 'syncSession');
                      return;
                    }
                  }
                }
              }
            }
          } catch {}
        }

        await handleSession(session, 'syncSession');
      } catch (err) {
        console.error('Session sync error:', err);
        setIsInitializing(false);
      }
    };

    syncSession();

    // Safety fallback: if an OAuth code was in the URL but Supabase did not emit a session after 8 seconds,
    // unblock initialization so the app doesn't spin indefinitely
    let oauthTimeoutId: any = null;
    if (hasPendingOAuthCallback()) {
      oauthTimeoutId = setTimeout(() => {
        setIsInitializing((curr) => {
          if (curr) {
            console.warn('[AUTH] OAuth exchange timeout reached, unblocking UI.');
            isOAuthCallbackPendingRef.current = false;
            syncSession();
            return false;
          }
          return curr;
        });
      }, 8000);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === 'SIGNED_OUT') {
        isOAuthCallbackPendingRef.current = false;
        setUser(null);
        setIsInitializing(false);
        return;
      }

      // Clean up URL if returning from OAuth redirect ONLY AFTER session is established
      if (session?.user && hasPendingOAuthCallback()) {
        cleanOAuthCallbackUrl();
        isOAuthCallbackPendingRef.current = false;
      }

      // If we are in an OAuth popup, notify parent and close
      const isPopup = window.opener || window.name === 'oauth_popup';
      if (isPopup) {
        if (session?.provider_token) {
          try {
            const provider = resolveFlowProvider();
            if (provider) {
              await supabase.functions.invoke('store-provider-token', {
                headers: session.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
                body: { 
                  providerToken: session.provider_token,
                  providerRefreshToken: session.provider_refresh_token,
                  provider
                }
              });
            }
          } catch (err) {
            console.error('Failed to trigger token storage from popup:', err);
          }
        }
        const workflow = new URLSearchParams(window.location.search).get('workflow');

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
      if (e.data?.type === 'OAUTH_AUTH_SUCCESS') {
        syncSession();
      }
    };
    window.addEventListener('message', handleMessage);

    const handleProviderConnected = async (e: Event) => {
      const type = e.type;
      setUser(prev => {
        if (!prev) return null;
        if (type === 'codevibe_github_connected') return { ...prev, isGithubLinked: true };
        if (type === 'codevibe_gitlab_connected') return { ...prev, isGitlabLinked: true };
        if (type === 'codevibe_bitbucket_connected') return { ...prev, isBitbucketLinked: true };
        if (type === 'codevibe_azure_connected') return { ...prev, isAzureLinked: true };
        return prev;
      });

      // Authoritative identity sync without wiping out the true state
      try {
        const identities = await loadLinkedProviderIdentities();
        if (Array.isArray(identities) && identities.length > 0) {
          const linked = extractLinkedProviders(identities);
          setUser(prev => {
            if (!prev) return null;
            return {
              ...prev,
              isGithubLinked: linked.isGithubLinked || prev.isGithubLinked,
              githubUsername: linked.githubUsername || prev.githubUsername,
              isGitlabLinked: linked.isGitlabLinked || prev.isGitlabLinked,
              gitlabUsername: linked.gitlabUsername || prev.gitlabUsername,
              isBitbucketLinked: linked.isBitbucketLinked || prev.isBitbucketLinked,
              bitbucketUsername: linked.bitbucketUsername || prev.bitbucketUsername,
              isAzureLinked: linked.isAzureLinked || prev.isAzureLinked,
              azureUsername: linked.azureUsername || prev.azureUsername,
            };
          });
        }
      } catch (err) {
        console.warn('[AUTH] Error refreshing identities on provider connected event:', err);
      }
    };

    window.addEventListener('codevibe_github_connected', handleProviderConnected);
    window.addEventListener('codevibe_gitlab_connected', handleProviderConnected);
    window.addEventListener('codevibe_bitbucket_connected', handleProviderConnected);
    window.addEventListener('codevibe_azure_connected', handleProviderConnected);

    const handleReposLoaded = () => {
      setProviderTokenSetupError(null);
    };
    window.addEventListener('codevibe_github_repos_loaded', handleReposLoaded);

    return () => {
      if (oauthTimeoutId) clearTimeout(oauthTimeoutId);
      subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('codevibe_github_connected', handleProviderConnected);
      window.removeEventListener('codevibe_gitlab_connected', handleProviderConnected);
      window.removeEventListener('codevibe_bitbucket_connected', handleProviderConnected);
      window.removeEventListener('codevibe_azure_connected', handleProviderConnected);
      window.removeEventListener('codevibe_github_repos_loaded', handleReposLoaded);
    };
  }, []);

  return { user, setUser, isInitializing, providerTokenSetupError, retryProviderTokenSetup };
}
