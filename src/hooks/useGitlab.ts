import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { type User } from './useAuth';
import { trackEvent } from '../lib/posthog';

export interface GitlabProject {
  id: number;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  description: string | null;
  default_branch: string;
  visibility: 'private' | 'internal' | 'public' | string;
  web_url: string;
  avatar_url: string | null;
  star_count: number;
  last_activity_at: string;
  namespace?: {
    id?: number;
    name?: string;
    path?: string;
    avatar_url?: string | null;
  };
}

export interface GitlabMergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: 'opened' | 'closed' | 'merged' | string;
  draft: boolean;
  created_at: string;
  updated_at: string;
  web_url: string;
  author: {
    id: number;
    name: string;
    username: string;
    avatar_url: string;
  };
  source_branch: string;
  target_branch: string;
  sha: string;
}

export type GitlabConnectionStatus = 'checking' | 'disconnected' | 'connected' | 'expired';

export function useGitlab(activeWorkflow: string, user?: User | null) {
  const [gitlabProjects, setGitlabProjects] = useState<GitlabProject[]>([]);
  const [isFetchingProjects, setIsFetchingProjects] = useState(false);
  const [gitlabProjectsError, setGitlabProjectsError] = useState('');
  const [gitlabSearchQuery, setGitlabSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const [gitlabMergeRequests, setGitlabMergeRequests] = useState<GitlabMergeRequest[]>([]);
  const [isFetchingMRs, setIsFetchingMRs] = useState(false);
  const [gitlabMRsError, setGitlabMRsError] = useState('');
  const [selectedMR, setSelectedMR] = useState<GitlabMergeRequest | null>(null);

  const [gitlabConnectionStatus, setGitlabConnectionStatus] = useState<GitlabConnectionStatus>('checking');
  const [gitlabUsername, setGitlabUsername] = useState<string | null>(null);
  const [isDisconnectingGitlab, setIsDisconnectingGitlab] = useState(false);
  const connectionInstanceRef = useRef(0);

  const checkConnection = useCallback(async () => {
    if (!user?.id) {
      setGitlabConnectionStatus('disconnected');
      return;
    }
    
    const currentInstance = connectionInstanceRef.current;
    setGitlabConnectionStatus('checking');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
         if (connectionInstanceRef.current === currentInstance) {
           setGitlabConnectionStatus('disconnected');
         }
         return;
      }
      
      const res = await fetch('/api/functions/check-gitlab-connection', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (connectionInstanceRef.current !== currentInstance) return;
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setGitlabConnectionStatus(data.status || 'disconnected');
      if (data.username) {
        setGitlabUsername(data.username);
      }
    } catch (err) {
      if (connectionInstanceRef.current !== currentInstance) return;
      console.warn('Failed to check gitlab connection:', err);
      setGitlabConnectionStatus('disconnected');
    }
  }, [user?.id]);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const isGitlabConnected = gitlabConnectionStatus === 'connected';

  const fetchGitlabProjects = useCallback(async () => {
    if (gitlabConnectionStatus === 'disconnected' || gitlabConnectionStatus === 'expired') return;

    const currentInstance = connectionInstanceRef.current;
    setIsFetchingProjects(true);
    setGitlabProjectsError('');
    console.log('[GITLAB_OAUTH] PROJECT_FETCH_START', {
      isGitlabConnected,
      user: user?.id,
      email: user?.email
    });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const { data, error } = await supabase.functions.invoke('fetch-gitlab-projects', {
        headers
      });

      if (connectionInstanceRef.current !== currentInstance) return;

      console.log('[GITLAB_OAUTH] PROJECT_FETCH_RESULT', {
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
           setGitlabConnectionStatus('expired');
         }
         throw new Error(data.error);
      }
      setGitlabProjects(data || []);
      setGitlabProjectsError('');
      window.dispatchEvent(new CustomEvent('codevibe_gitlab_projects_loaded'));
    } catch (err: any) {
      if (connectionInstanceRef.current !== currentInstance) return;
      const msg = err.message || 'Failed to fetch GitLab projects.';
      setGitlabProjectsError(msg);
      if (msg.includes('expired')) {
         setGitlabConnectionStatus('expired');
      }
    } finally {
      if (connectionInstanceRef.current === currentInstance) {
        setIsFetchingProjects(false);
      }
    }
  }, [gitlabConnectionStatus]);

  const fetchGitlabMergeRequests = useCallback(async (projectId: number) => {
    setIsFetchingMRs(true);
    setGitlabMRsError('');
    setSelectedMR(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const { data, error } = await supabase.functions.invoke('fetch-gitlab-merge-requests', {
        headers,
        body: { projectId }
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
      setGitlabMergeRequests(data || []);
      setGitlabMRsError('');
    } catch (err: any) {
      console.error('Fetch GitLab MRs Error:', err);
      setGitlabMRsError(err.message || 'Failed to fetch merge requests.');
    } finally {
      setIsFetchingMRs(false);
    }
  }, []);

  const selectProject = useCallback((project: GitlabProject) => {
    setSelectedProjectId(project.id);
    fetchGitlabMergeRequests(project.id);
  }, [fetchGitlabMergeRequests]);

  const selectMergeRequest = useCallback((mr: GitlabMergeRequest) => {
    setSelectedMR(mr);
  }, []);

  useEffect(() => {
    if (activeWorkflow === 'gitlab' && gitlabConnectionStatus === 'connected') {
      if (gitlabProjects.length === 0 && !isFetchingProjects && !gitlabProjectsError) {
        fetchGitlabProjects();
      }
    }
  }, [activeWorkflow, gitlabConnectionStatus, gitlabProjects.length, isFetchingProjects, gitlabProjectsError, fetchGitlabProjects]);

  // Listen for connection completion and disconnection events from OAuth linking
  useEffect(() => {
    const handleConnected = () => {
      trackEvent('gitlab_connected');
      setGitlabProjects([]);
      setSelectedProjectId(null);
      setSelectedMR(null);
      setGitlabSearchQuery('');
      setGitlabProjectsError('');
      checkConnection();
    };
    
    const handleDisconnected = () => {
      setGitlabConnectionStatus('disconnected');
      setGitlabProjects([]);
      setIsFetchingProjects(false);
      setGitlabProjectsError('');
      setGitlabSearchQuery('');
      setSelectedProjectId(null);
      setSelectedMR(null);
      setGitlabMergeRequests([]);
    };
    
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('gitlab_connected') === 'true') {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('gitlab_connected');
      window.history.replaceState({}, '', newUrl.toString());
      handleConnected();
    }
    
    window.addEventListener('codevibe_gitlab_connected', handleConnected);
    window.addEventListener('codevibe_gitlab_disconnected', handleDisconnected);
    return () => {
      window.removeEventListener('codevibe_gitlab_connected', handleConnected);
      window.removeEventListener('codevibe_gitlab_disconnected', handleDisconnected);
    };
  }, [checkConnection]);

  const clearGitlabSelection = useCallback(() => {
    setGitlabSearchQuery('');
    setSelectedProjectId(null);
    setSelectedMR(null);
    setGitlabMergeRequests([]);
  }, []);

  const clearGitlabCache = useCallback(() => {
    setGitlabProjects([]);
    setIsFetchingProjects(false);
    setGitlabProjectsError('');
    setGitlabSearchQuery('');
    setSelectedProjectId(null);
    setSelectedMR(null);
    setGitlabMergeRequests([]);
  }, []);

  const disconnectGitlab = useCallback(async () => {
    setIsDisconnectingGitlab(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/functions/disconnect-gitlab', {
        method: 'POST',
        headers: session?.access_token 
          ? { 
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            }
          : { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        let errorMsg = `HTTP Error: ${res.status}`;
        try {
          const body = await res.json();
          if (body?.error) errorMsg = body.error;
        } catch {}
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (data?.error) {
        throw new Error(data.error);
      }

      setGitlabConnectionStatus('disconnected');
      clearGitlabCache();
      trackEvent('gitlab_disconnected');
      window.dispatchEvent(new CustomEvent('codevibe_gitlab_disconnected'));
    } catch (err) {
      console.error('Failed to disconnect GitLab:', err);
    } finally {
      setIsDisconnectingGitlab(false);
    }
  }, [clearGitlabCache]);

  return {
    gitlabProjects,
    isFetchingProjects,
    gitlabProjectsError,
    gitlabSearchQuery,
    setGitlabSearchQuery,
    selectedProjectId,
    setSelectedProjectId,
    selectedProject: gitlabProjects.find(p => p.id === selectedProjectId) || null,
    gitlabMergeRequests,
    isFetchingMRs,
    gitlabMRsError,
    selectedMR,
    selectProject,
    selectMergeRequest,
    fetchGitlabProjects,
    fetchGitlabMergeRequests,
    gitlabConnectionStatus,
    isGitlabConnected,
    gitlabUsername,
    clearGitlabSelection,
    clearGitlabCache,
    disconnectGitlab,
    isDisconnectingGitlab
  };
}
