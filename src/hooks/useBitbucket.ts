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
  const [hasFetchedRepos, setHasFetchedRepos] = useState(false);
  const [bitbucketReposError, setBitbucketReposError] = useState('');
  const [bitbucketSearchQuery, setBitbucketSearchQuery] = useState('');
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(null);

  const [bitbucketPRs, setBitbucketPRs] = useState<BitbucketPullRequest[]>([]);
  const [isFetchingPRs, setIsFetchingPRs] = useState(false);
  const [bitbucketPRsError, setBitbucketPRsError] = useState('');
  const [selectedPR, setSelectedPR] = useState<BitbucketPullRequest | null>(null);

  const [isBitbucketConnected, setIsBitbucketConnected] = useState(false);
  const [isBitbucketExpired, setIsBitbucketExpired] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);

  const checkConnection = useCallback(async () => {
    setIsCheckingConnection(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setIsBitbucketConnected(false);
        setIsBitbucketExpired(false);
        return;
      }

      const res = await fetch('/api/functions/check-bitbucket-connection', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!res.ok) {
        setIsBitbucketConnected(false);
        setIsBitbucketExpired(false);
        return;
      }

      const data = await res.json();
      if (data.status === 'connected') {
        setIsBitbucketConnected(true);
        setIsBitbucketExpired(false);
      } else if (data.status === 'expired') {
        setIsBitbucketConnected(false);
        setIsBitbucketExpired(true);
      } else {
        setIsBitbucketConnected(false);
        setIsBitbucketExpired(false);
      }
    } catch (err) {
      console.error('Check Bitbucket connection error:', err);
      setIsBitbucketConnected(false);
      setIsBitbucketExpired(false);
    } finally {
      setIsCheckingConnection(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection, user?.isBitbucketLinked, activeWorkflow]);

  useEffect(() => {
    const handleConnected = () => checkConnection();
    window.addEventListener('codevibe_bitbucket_connected', handleConnected);
    return () => window.removeEventListener('codevibe_bitbucket_connected', handleConnected);
  }, [checkConnection]);

  const fetchBitbucketRepos = useCallback(async () => {
    setIsFetchingRepos(true);
    setBitbucketReposError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const res = await fetch('/api/functions/fetch-bitbucket-repos', {
        headers
      });

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error('Failed to parse response from server');
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to fetch Bitbucket repositories');
      }

      setBitbucketRepos(data || []);
      setBitbucketReposError('');
    } catch (err: any) {
      console.error('Fetch Bitbucket Repos Error:', err);
      setBitbucketReposError(err.message || 'Failed to fetch Bitbucket repositories.');
    } finally {
      setHasFetchedRepos(true);
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

      const res = await fetch('/api/functions/fetch-bitbucket-prs', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ repoFullName })
      });

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error('Failed to parse response from server');
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to fetch pull requests');
      }

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
      if (!hasFetchedRepos && !isFetchingRepos && !bitbucketReposError) {
        fetchBitbucketRepos();
      }
    }
  }, [activeWorkflow, isBitbucketConnected, hasFetchedRepos, isFetchingRepos, bitbucketReposError, fetchBitbucketRepos]);

  // Listen for connection completion event from OAuth linking
  useEffect(() => {
    const handleConnected = () => {
      trackEvent('bitbucket_connected');
      setBitbucketRepos([]);
      setHasFetchedRepos(false);
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
      setHasFetchedRepos(false);
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
    isBitbucketExpired,
    isCheckingConnection,
    checkConnection,
    clearBitbucketSelection,
    disconnectBitbucket,
    isDisconnecting,
  };
}
