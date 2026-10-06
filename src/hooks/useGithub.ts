import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { type User } from './useAuth';
import { trackEvent } from '../lib/posthog';

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  language: string | null;
  updated_at: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export type GithubConnectionStatus = 'checking' | 'disconnected' | 'connected' | 'expired';

export function useGithub(activeWorkflow: string, user?: User | null) {
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([]);
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [githubReposError, setGithubReposError] = useState('');
  const [githubSearchQuery, setGithubSearchQuery] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);

  const [githubConnectionStatus, setGithubConnectionStatus] = useState<GithubConnectionStatus>('checking');
  const [githubUsername, setGithubUsername] = useState<string | null>(user?.githubUsername || null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const connectionInstanceRef = useRef(0);

  const checkConnection = useCallback(async () => {
    if (!user?.id) {
      setGithubConnectionStatus('disconnected');
      return;
    }
    
    const currentInstance = connectionInstanceRef.current;
    setGithubConnectionStatus('checking');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
         if (connectionInstanceRef.current === currentInstance) {
           setGithubConnectionStatus('disconnected');
         }
         return;
      }
      
      const { data, error } = await supabase.functions.invoke('check-github-connection', {
         headers: { Authorization: `Bearer ${session.access_token}` }
      });
      
      if (connectionInstanceRef.current !== currentInstance) return;
      if (error) throw error;
      setGithubConnectionStatus(data.status || 'disconnected');
      if (data.username) {
        setGithubUsername(data.username);
      }
    } catch (err) {
      if (connectionInstanceRef.current !== currentInstance) return;
      console.warn('Failed to check github connection:', err);
      setGithubConnectionStatus('disconnected');
    }
  }, [user?.id]);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const disconnectGithub = useCallback(async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    connectionInstanceRef.current += 1;
    
    // Optimistic UI update
    setGithubConnectionStatus('disconnected');
    setGithubRepos([]);
    setGithubUsername(null);
    setSelectedRepoId(null);
    setGithubReposError('');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      const { error } = await supabase.functions.invoke('disconnect-github', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      
      if (error) throw error;
      
      trackEvent('github_disconnected');
    } catch (err) {
      console.error('Failed to disconnect github:', err);
      // Optional: rollback optimistic UI if you want, or just leave it disconnected
    } finally {
      setIsDisconnecting(false);
    }
  }, [isDisconnecting]);

  const fetchGithubRepositories = useCallback(async () => {
    if (githubConnectionStatus === 'disconnected' || githubConnectionStatus === 'expired') return;

    const currentInstance = connectionInstanceRef.current;
    setIsFetchingRepos(true);
    setGithubReposError('');
    console.log('[GITHUB_OAUTH] REPOSITORY_FETCH_START', {
      isGithubConnected,
      user: user?.id,
      email: user?.email
    });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const { data, error } = await supabase.functions.invoke('fetch-github-repositories', {
        headers
      });
      
      if (connectionInstanceRef.current !== currentInstance) return;

      console.log('[GITHUB_OAUTH] REPOSITORY_FETCH_RESULT', {
        success: !error && !data?.error,
        count: Array.isArray(data) ? data.length : undefined,
        data,
        error
      });
      if (error) {
        let errorMsg = error.message;
        if (error.context) {
          try {
            const body = await error.context.json();
            if (body?.error) {
              errorMsg = body.error;
            }
          } catch {}
        }
        throw new Error(errorMsg);
      }
      if (data?.error) {
         if (data.error.includes('expired')) {
           setGithubConnectionStatus('expired');
         }
         throw new Error(data.error);
      }
      setGithubRepos(data || []);
      setGithubReposError('');
      window.dispatchEvent(new CustomEvent('codevibe_github_repos_loaded'));
    } catch (err: any) {
      if (connectionInstanceRef.current !== currentInstance) return;
      const msg = err.message || 'Failed to fetch repositories.';
      setGithubReposError(msg);
      if (msg.includes('expired')) {
         setGithubConnectionStatus('expired');
      }
    } finally {
      if (connectionInstanceRef.current === currentInstance) {
        setIsFetchingRepos(false);
      }
    }
  }, [githubConnectionStatus]);

  useEffect(() => {
    if (activeWorkflow === 'github' && githubConnectionStatus === 'connected') {
      if (githubRepos.length === 0 && !isFetchingRepos && !githubReposError) {
        fetchGithubRepositories();
      }
    }
  }, [activeWorkflow, githubConnectionStatus, githubRepos.length, isFetchingRepos, githubReposError, fetchGithubRepositories]);

  // Listen for connection completion event from OAuth linking
  useEffect(() => {
    const handleConnected = () => {
      trackEvent('github_connected');
      setGithubRepos([]);
      setSelectedRepoId(null);
      setGithubSearchQuery('');
      setGithubReposError('');
      checkConnection(); // Refresh the real connection status
      if (activeWorkflow === 'github') {
        fetchGithubRepositories();
      }
    };
    window.addEventListener('codevibe_github_connected', handleConnected);
    return () => {
      window.removeEventListener('codevibe_github_connected', handleConnected);
    };
  }, [activeWorkflow, checkConnection, fetchGithubRepositories]);

  const isGithubConnected = githubConnectionStatus === 'connected';

  const clearGithubSelection = useCallback(() => {
    setGithubSearchQuery('');
    setSelectedRepoId(null);
  }, []);

  const clearGithubCache = useCallback(() => {
    setGithubRepos([]);
    setIsFetchingRepos(false);
    setGithubReposError('');
    setGithubSearchQuery('');
    setSelectedRepoId(null);
  }, []);

  return {
    githubRepos,
    isFetchingRepos,
    githubReposError,
    githubSearchQuery,
    setGithubSearchQuery,
    selectedRepoId,
    setSelectedRepoId,
    fetchGithubRepositories,
    githubConnectionStatus,
    isGithubConnected,
    githubUsername,
    disconnectGithub,
    isDisconnecting,
    clearGithubSelection,
    clearGithubCache
  };
}
