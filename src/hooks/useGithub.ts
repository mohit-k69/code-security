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

export function useGithub(activeWorkflow: string) {
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([]);
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [githubReposError, setGithubReposError] = useState('');
  const [githubSearchQuery, setGithubSearchQuery] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);

  const fetchGithubRepositories = useCallback(async () => {
    setIsFetchingRepos(true);
    setGithubReposError('');
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
      setIsGithubConnected(true);
      setGithubReposError('');
    } catch (err: any) {
      console.error('Fetch GitHub Repositories Error:', err);
      setGithubReposError(err.message || 'Failed to fetch repositories.');
      setIsGithubConnected(false);
    } finally {
      setIsFetchingRepos(false);
    }
  }, []);

  useEffect(() => {
    if (activeWorkflow === 'github') {
      if (!hasAttemptedFetch && !isFetchingRepos) {
        setHasAttemptedFetch(true);
        fetchGithubRepositories();
      }
    } else {
      setHasAttemptedFetch(false);
    }
  }, [activeWorkflow, hasAttemptedFetch, isFetchingRepos, fetchGithubRepositories]);

  // Listen for connection completion event from OAuth linking
  useEffect(() => {
    const handleConnected = () => {
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
    setIsGithubConnected(false);
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
    isGithubConnected,
    clearGithubSelection,
    clearGithubCache
  };
}
