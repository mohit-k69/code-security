import { useState, useCallback, useEffect } from 'react';
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

export type GitlabConnectionStatus = 'checking' | 'disconnected' | 'connected';

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

  const isGitlabConnected = Boolean(user?.isGitlabLinked);
  const gitlabConnectionStatus: GitlabConnectionStatus = isGitlabConnected ? 'connected' : 'disconnected';

  const fetchGitlabProjects = useCallback(async () => {
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
      if (data?.error) throw new Error(data.error);
      setGitlabProjects(data || []);
      setGitlabProjectsError('');
      window.dispatchEvent(new CustomEvent('codevibe_gitlab_projects_loaded'));
    } catch (err: any) {
      console.error('Fetch GitLab Projects Error:', err);
      setGitlabProjectsError(err.message || 'Failed to fetch GitLab projects.');
    } finally {
      setIsFetchingProjects(false);
    }
  }, [isGitlabConnected, user?.id, user?.email]);

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
    if (activeWorkflow === 'gitlab' && isGitlabConnected) {
      if (gitlabProjects.length === 0 && !isFetchingProjects && !gitlabProjectsError) {
        fetchGitlabProjects();
      }
    }
  }, [activeWorkflow, isGitlabConnected, gitlabProjects.length, isFetchingProjects, gitlabProjectsError, fetchGitlabProjects]);

  // Listen for connection completion event from OAuth linking
  useEffect(() => {
    const handleConnected = () => {
      trackEvent('gitlab_connected');
      setGitlabProjects([]);
      setSelectedProjectId(null);
      setSelectedMR(null);
      setGitlabSearchQuery('');
      setGitlabProjectsError('');
      if (activeWorkflow === 'gitlab') {
        fetchGitlabProjects();
      }
    };
    window.addEventListener('codevibe_gitlab_connected', handleConnected);
    return () => {
      window.removeEventListener('codevibe_gitlab_connected', handleConnected);
    };
  }, [activeWorkflow, fetchGitlabProjects]);

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
    clearGitlabSelection,
    clearGitlabCache
  };
}
