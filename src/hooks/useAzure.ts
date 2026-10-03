import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { type User } from './useAuth';
import { trackEvent } from '../lib/posthog';

export interface AzureRepo {
  id: string;
  name: string;
  project_name: string;
  organization: string;
  full_name: string;
  default_branch: string;
  web_url: string;
  is_private: boolean;
  size: number;
}

export interface AzurePullRequest {
  id: number;
  number: number;
  title: string;
  description: string;
  state: 'open' | 'completed' | 'abandoned' | string;
  draft: boolean;
  created_at: string;
  updated_at: string;
  html_url: string;
  author: {
    name: string;
    username: string;
    avatar_url: string;
  };
  source_branch: string;
  target_branch: string;
  sha: string;
}

export function useAzure(activeWorkflow: string, user?: User | null) {
  const [azureRepos, setAzureRepos] = useState<AzureRepo[]>([]);
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [azureReposError, setAzureReposError] = useState('');
  const [azureSearchQuery, setAzureSearchQuery] = useState('');
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);

  const [azurePRs, setAzurePRs] = useState<AzurePullRequest[]>([]);
  const [isFetchingPRs, setIsFetchingPRs] = useState(false);
  const [azurePRsError, setAzurePRsError] = useState('');
  const [selectedPR, setSelectedPR] = useState<AzurePullRequest | null>(null);

  const isAzureConnected = Boolean(user?.isAzureLinked);

  const fetchAzureRepos = useCallback(async () => {
    setIsFetchingRepos(true);
    setAzureReposError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const { data, error } = await supabase.functions.invoke('fetch-azure-repos', {
        headers
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
      setAzureRepos(data || []);
      setAzureReposError('');
    } catch (err: any) {
      console.error('Fetch Azure Repos Error:', err);
      setAzureReposError(err.message || 'Failed to fetch Azure DevOps repositories.');
    } finally {
      setIsFetchingRepos(false);
    }
  }, []);

  const fetchAzurePRs = useCallback(async (repo: AzureRepo) => {
    setIsFetchingPRs(true);
    setAzurePRsError('');
    setSelectedPR(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const { data, error } = await supabase.functions.invoke('fetch-azure-prs', {
        headers,
        body: {
          organization: repo.organization,
          project: repo.project_name,
          repositoryId: repo.id,
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
      setAzurePRs(data || []);
      setAzurePRsError('');
    } catch (err: any) {
      console.error('Fetch Azure PRs Error:', err);
      setAzurePRsError(err.message || 'Failed to fetch Azure DevOps pull requests.');
    } finally {
      setIsFetchingPRs(false);
    }
  }, []);

  const selectRepo = useCallback((repo: AzureRepo) => {
    setSelectedRepoId(repo.id);
    fetchAzurePRs(repo);
  }, [fetchAzurePRs]);

  const selectPullRequest = useCallback((pr: AzurePullRequest) => {
    setSelectedPR(pr);
  }, []);

  useEffect(() => {
    if (activeWorkflow === 'azure' && isAzureConnected) {
      if (azureRepos.length === 0 && !isFetchingRepos && !azureReposError) {
        fetchAzureRepos();
      }
    }
  }, [activeWorkflow, isAzureConnected, azureRepos.length, isFetchingRepos, azureReposError, fetchAzureRepos]);

  // Listen for connection completion event from OAuth linking
  useEffect(() => {
    const handleConnected = () => {
      trackEvent('azure_connected');
      setAzureRepos([]);
      setSelectedRepoId(null);
      setSelectedPR(null);
      setAzureSearchQuery('');
      setAzureReposError('');
      if (activeWorkflow === 'azure') {
        fetchAzureRepos();
      }
    };
    window.addEventListener('codevibe_azure_connected', handleConnected);
    return () => {
      window.removeEventListener('codevibe_azure_connected', handleConnected);
    };
  }, [activeWorkflow, fetchAzureRepos]);

  const clearAzureSelection = useCallback(() => {
    setAzureSearchQuery('');
    setSelectedRepoId(null);
    setSelectedPR(null);
    setAzurePRs([]);
  }, []);

  return {
    azureRepos,
    isFetchingRepos,
    azureReposError,
    azureSearchQuery,
    setAzureSearchQuery,
    selectedRepoId,
    setSelectedRepoId,
    selectedRepo: azureRepos.find(r => r.id === selectedRepoId) || null,
    azurePRs,
    isFetchingPRs,
    azurePRsError,
    selectedPR,
    selectRepo,
    selectPullRequest,
    fetchAzureRepos,
    fetchAzurePRs,
    isAzureConnected,
    clearAzureSelection
  };
}
