import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { type User } from './useAuth';
import { trackEvent } from '../lib/posthog';

export interface BitbucketRepo {
  id: string;
  uuid: string;
  name: string;
  full_name: string;
  owner: string;
  workspace: string;
  description: string | null;
  is_private: boolean;
  default_branch: string;
  updated_on: string;
  avatar_url: string | null;
  html_url: string;
}

export interface BitbucketPullRequest {
  id: number;
  number: number;
  title: string;
  description: string;
  state: 'open' | 'merged' | 'declined' | string;
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

export function useBitbucket(activeWorkflow: string, user?: User | null) {
  const [bitbucketRepos, setBitbucketRepos] = useState<BitbucketRepo[]>([]);
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [bitbucketReposError, setBitbucketReposError] = useState('');
  const [bitbucketSearchQuery, setBitbucketSearchQuery] = useState('');
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(null);

  const [bitbucketPRs, setBitbucketPRs] = useState<BitbucketPullRequest[]>([]);
  const [isFetchingPRs, setIsFetchingPRs] = useState(false);
  const [bitbucketPRsError, setBitbucketPRsError] = useState('');
  const [selectedPR, setSelectedPR] = useState<BitbucketPullRequest | null>(null);

  const isBitbucketConnected = Boolean(user?.isBitbucketLinked);

  const fetchBitbucketRepos = useCallback(async () => {
    setIsFetchingRepos(true);
    setBitbucketReposError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const { data, error } = await supabase.functions.invoke('fetch-bitbucket-repos', {
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
      setBitbucketRepos(data || []);
      setBitbucketReposError('');
    } catch (err: any) {
      console.error('Fetch Bitbucket Repos Error:', err);
      setBitbucketReposError(err.message || 'Failed to fetch Bitbucket repositories.');
    } finally {
      setIsFetchingRepos(false);
    }
  }, []);

  const fetchBitbucketPRs = useCallback(async (repoFullName: string) => {
    setIsFetchingPRs(true);
    setBitbucketPRsError('');
    setSelectedPR(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const { data, error } = await supabase.functions.invoke('fetch-bitbucket-prs', {
        headers,
        body: { repoFullName }
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
      setBitbucketPRs(data || []);
      setBitbucketPRsError('');
    } catch (err: any) {
      console.error('Fetch Bitbucket PRs Error:', err);
      setBitbucketPRsError(err.message || 'Failed to fetch Bitbucket pull requests.');
    } finally {
      setIsFetchingPRs(false);
    }
  }, []);

  const selectRepo = useCallback((repo: BitbucketRepo) => {
    setSelectedRepoFullName(repo.full_name);
    fetchBitbucketPRs(repo.full_name);
  }, [fetchBitbucketPRs]);

  const selectPullRequest = useCallback((pr: BitbucketPullRequest) => {
    setSelectedPR(pr);
  }, []);

  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    if (activeWorkflow === 'bitbucket' && isBitbucketConnected) {
      if (bitbucketRepos.length === 0 && !isFetchingRepos && !bitbucketReposError) {
        fetchBitbucketRepos();
      }
    }
  }, [activeWorkflow, isBitbucketConnected, bitbucketRepos.length, isFetchingRepos, bitbucketReposError, fetchBitbucketRepos]);

  // Listen for connection completion event from OAuth linking
  useEffect(() => {
    const handleConnected = () => {
      trackEvent('bitbucket_connected');
      setBitbucketRepos([]);
      setSelectedRepoFullName(null);
      setSelectedPR(null);
      setBitbucketSearchQuery('');
      setBitbucketReposError('');
      if (activeWorkflow === 'bitbucket') {
        fetchBitbucketRepos();
      }
    };
    
    const handleDisconnected = () => {
      setBitbucketRepos([]);
      setSelectedRepoFullName(null);
      setSelectedPR(null);
      setBitbucketSearchQuery('');
      setBitbucketReposError('');
      setBitbucketPRs([]);
    };
    
    window.addEventListener('codevibe_bitbucket_connected', handleConnected);
    window.addEventListener('codevibe_bitbucket_disconnected', handleDisconnected);
    return () => {
      window.removeEventListener('codevibe_bitbucket_connected', handleConnected);
      window.removeEventListener('codevibe_bitbucket_disconnected', handleDisconnected);
    };
  }, [activeWorkflow, fetchBitbucketRepos]);

  const clearBitbucketSelection = useCallback(() => {
    setBitbucketSearchQuery('');
    setSelectedRepoFullName(null);
    setSelectedPR(null);
    setBitbucketPRs([]);
  }, []);

  const disconnectBitbucket = useCallback(async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 1. Delete credentials from the backend oauth_connections table
      const res = await fetch('/api/functions/disconnect-bitbucket', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        let errorMsg = 'Failed to disconnect Bitbucket from backend.';
        try {
          const body = await res.json();
          if (body.error) errorMsg = body.error;
        } catch {}
        throw new Error(errorMsg);
      }
      
      // 2. ONLY if backend deletion succeeds, remove the local Supabase identity
      try {
        const { data: { identities } } = await supabase.auth.getUserIdentities();
        const bitbucketIdentity = identities?.find(id => id.provider === 'bitbucket');
        
        if (bitbucketIdentity) {
          const { error } = await supabase.auth.unlinkIdentity(bitbucketIdentity);
          if (error) {
            console.warn('[disconnectBitbucket] unlinkIdentity failed:', error.message);
          }
        }
      } catch (err) {
         console.warn('[disconnectBitbucket] Failed to get or unlink identity:', err);
      }
      
      // 3. Clear the frontend UI
      window.dispatchEvent(new CustomEvent('codevibe_bitbucket_disconnected'));
      trackEvent('bitbucket_disconnected');
    } catch (err) {
      console.error('Failed to disconnect bitbucket:', err);
    } finally {
      setIsDisconnecting(false);
    }
  }, [isDisconnecting]);

  return {
    bitbucketRepos,
    isFetchingRepos,
    bitbucketReposError,
    bitbucketSearchQuery,
    setBitbucketSearchQuery,
    selectedRepoFullName,
    setSelectedRepoFullName,
    selectedRepo: bitbucketRepos.find(r => r.full_name === selectedRepoFullName) || null,
    bitbucketPRs,
    isFetchingPRs,
    bitbucketPRsError,
    selectedPR,
    selectRepo,
    selectPullRequest,
    fetchBitbucketRepos,
    fetchBitbucketPRs,
    isBitbucketConnected,
    clearBitbucketSelection,
    disconnectBitbucket,
    isDisconnecting,
  };
}
