import { useState, useCallback, useEffect } from 'react';
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

export type GithubConnectionStatus = 'checking' | 'disconnected' | 'connected';

export function useGithub(activeWorkflow: string, user?: User | null) {
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([]);
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [githubReposError, setGithubReposError] = useState('');
  const [githubSearchQuery, setGithubSearchQuery] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);

  const isGithubConnected = Boolean(user?.isGithubLinked);
  const githubConnectionStatus: GithubConnectionStatus = isGithubConnected ? 'connected' : 'disconnected';

  const fetchGithubRepositories = useCallback(async () => {
    setIsFetchingRepos(true);
    setGithubReposError('');
    console.log('[GITHUB_OAUTH] REPOSITORY_FETCH_START', {
      isGithubConnected,
      user: user?.id,
      email: user?.email
    });
    try {
      const { data, error } = await supabase.functions.invoke('fetch-github-repositories');
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
      if (data?.error) throw new Error(data.error);
      setGithubRepos(data || []);
      setGithubReposError('');
    } catch (err: any) {
      console.error('Fetch GitHub Repositories Error:', err);
      console.log('[GITHUB_OAUTH] REPOSITORY_FETCH_RESULT', {
        success: false,
        error: err.message || err
      });
      setGithubReposError(err.message || 'Failed to fetch repositories.');
    } finally {
      setIsFetchingRepos(false);
    }
  }, [isGithubConnected, user?.id, user?.email]);

  useEffect(() => {
    if (activeWorkflow === 'github' && isGithubConnected) {
      if (githubRepos.length === 0 && !isFetchingRepos && !githubReposError) {
        fetchGithubRepositories();
      }
    }
  }, [activeWorkflow, isGithubConnected, githubRepos.length, isFetchingRepos, githubReposError, fetchGithubRepositories]);

  // Listen for connection completion event from OAuth linking
  useEffect(() => {
    const handleConnected = () => {
      trackEvent('github_connected');
      setGithubRepos([]);
      setSelectedRepoId(null);
      setGithubSearchQuery('');
      setGithubReposError('');
      fetchGithubRepositories();
    };
    window.addEventListener('codevibe_github_connected', handleConnected);
    return () => {
      window.removeEventListener('codevibe_github_connected', handleConnected);
    };
  }, [fetchGithubRepositories]);

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
    clearGithubSelection,
    clearGithubCache
  };
}
