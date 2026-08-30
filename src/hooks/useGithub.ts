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

  const fetchGithubRepositories = useCallback(async () => {
    setIsFetchingRepos(true);
    setGithubReposError('');
    try {
      const { data, error } = await supabase.functions.invoke('fetch-github-repositories');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGithubRepos(data || []);
      setIsGithubConnected(true);
    } catch (err: any) {
      console.error('Fetch GitHub Repositories Error:', err);
      setGithubReposError(err.message || 'Failed to fetch repositories.');
      setIsGithubConnected(false);
    } finally {
      setIsFetchingRepos(false);
    }
  }, []);

  useEffect(() => {
    if (activeWorkflow === 'github' && githubRepos.length === 0 && !isFetchingRepos && !isGithubConnected) {
      fetchGithubRepositories();
    }
  }, [activeWorkflow, githubRepos.length, isFetchingRepos, isGithubConnected, fetchGithubRepositories]);

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
