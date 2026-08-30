import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

export function useGithub(activeWorkflow: string) {
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([]);
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [githubReposError, setGithubReposError] = useState('');
  const [githubSearchQuery, setGithubSearchQuery] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [githubConnectionStatus, setGithubConnectionStatus] = useState<GithubConnectionStatus>('checking');
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);

  const fetchGithubRepositories = useCallback(async () => {
    setIsFetchingRepos(true);
    setGithubReposError('');
    setGithubConnectionStatus('checking');
    try {
      const { data, error } = await supabase.functions.invoke('fetch-github-repositories');
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
      setGithubConnectionStatus('connected');
      setGithubReposError('');
    } catch (err: any) {
      console.error('Fetch GitHub Repositories Error:', err);
      setGithubReposError(err.message || 'Failed to fetch repositories.');
      setGithubConnectionStatus('disconnected');
    } finally {
      setIsFetchingRepos(false);
    }
  }, []);

  useEffect(() => {
    if (activeWorkflow === 'github') {
      if (!hasAttemptedFetch && !isFetchingRepos && githubConnectionStatus === 'checking') {
        setHasAttemptedFetch(true);
        fetchGithubRepositories();
      }
    } else {
      setHasAttemptedFetch(false);
    }
  }, [activeWorkflow, hasAttemptedFetch, isFetchingRepos, githubConnectionStatus, fetchGithubRepositories]);

  // Listen for connection completion event from OAuth linking
  useEffect(() => {
    const handleConnected = () => {
      setGithubConnectionStatus('checking');
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
    setGithubConnectionStatus('checking');
    setHasAttemptedFetch(false);
  }, []);

  const isGithubConnected = githubConnectionStatus === 'connected';

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
