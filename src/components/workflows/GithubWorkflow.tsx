import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { GithubRepo } from '../../hooks/useGithub';

// Extracted Components
import { GithubHeader } from './github/GithubHeader';
import { SetupIncompleteError, ConnectionError, GenericError } from './github/GithubErrorStates';
import { GithubRepoList } from './github/GithubRepoList';
import { GithubAnalysisModals, AnalysisState } from './github/GithubAnalysisModals';

interface GithubWorkflowProps {
  setActiveWorkflow: (workflow: 'none') => void;
  isFetchingRepos: boolean;
  githubReposError: string;
  fetchGithubRepositories: () => void;
  githubSearchQuery: string;
  setGithubSearchQuery: (query: string) => void;
  githubRepos: GithubRepo[];
  selectedRepoId: number | null;
  setSelectedRepoId: (id: number | null) => void;
  providerTokenSetupError?: string | null;
  retryProviderTokenSetup?: () => void;
  onAnalysisComplete: (repoName: string, prNumber: number, result: any) => void;
}

export function GithubWorkflow({
  setActiveWorkflow,
  isFetchingRepos,
  githubReposError,
  fetchGithubRepositories,
  githubSearchQuery,
  setGithubSearchQuery,
  githubRepos,
  selectedRepoId,
  setSelectedRepoId,
  providerTokenSetupError,
  retryProviderTokenSetup,
  onAnalysisComplete
}: GithubWorkflowProps) {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [viewStyle, setViewStyle] = useState<'grid' | 'list'>('grid');
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ status: 'idle' });
  const [linkError, setLinkError] = useState<string>('');

  const handleConnectGithub = async () => {
    setLinkError('');
    try {
      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'github',
        options: {
          redirectTo: window.location.origin + '?workflow=github',
          skipBrowserRedirect: true
        }
      });
      if (error) {
        if (error.message.toLowerCase().includes('already exists') || error.message.toLowerCase().includes('identity')) {
          setLinkError('This GitHub account is already connected to another Code Vibe account. Please disconnect it from the other account or use a different GitHub account.');
        } else {
          setLinkError('Failed to connect GitHub. Please try again.');
        }
        return;
      }
      if (data?.url) {
        window.open(data.url, 'oauth_popup', 'width=600,height=700');
      }
    } catch (err: any) {
      console.error('Failed to link GitHub:', err);
      setLinkError('An unexpected error occurred while connecting GitHub.');
    }
  };

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        if (event.data.workflow) {
          window.location.href = window.location.pathname + '?workflow=' + event.data.workflow;
        } else {
          window.location.reload();
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleAnalyze = async (repo: GithubRepo, prNumber?: number) => {
    setSelectedRepoId(repo.id);
    setAnalysisState({ status: 'loading' });
    try {
      const { data, error } = await supabase.functions.invoke('analyze-repository', {
        body: { owner: repo.owner.login, repo: repo.name, prNumber }
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data.status === 'no_prs') {
        setAnalysisState({ status: 'no_prs' });
      } else if (data.status === 'select_pr') {
        setAnalysisState({ status: 'select_pr', prs: data.prs });
      } else if (data.status === 'analysis_data_ready' || data.report || data.metadata || data.checkpoints || data.verdict || data.findings) {
        const metadata = data.metadata || data.report || data;
        const resolvedPrNumber = data.prNumber || data.report?.repository?.prNumber || prNumber || 1;
        
        setAnalysisState({ status: 'analysis_data_ready', metadata });
        onAnalysisComplete(repo.name, resolvedPrNumber, metadata);
        setTimeout(() => setActiveWorkflow('none'), 1200);
      } else {
        console.error('Unrecognized payload received from analyze-repository:', data);
        throw new Error('Unknown response format from server.');
      }
    } catch (err: any) {
      console.error('Analyze Error:', err);
      setAnalysisState({ status: 'error', message: err.message || 'Failed to start analysis.' });
    }
  };

  const isConnectionError = githubReposError.toLowerCase().includes('connect') || githubReposError.toLowerCase().includes('oauth');

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col h-full"
    >
      <GithubHeader 
        setActiveWorkflow={setActiveWorkflow}
        isSearchExpanded={isSearchExpanded}
        setIsSearchExpanded={setIsSearchExpanded}
        githubSearchQuery={githubSearchQuery}
        setGithubSearchQuery={setGithubSearchQuery}
        viewStyle={viewStyle}
        setViewStyle={setViewStyle}
      />
      
      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full pt-4 h-[calc(100vh-200px)]">
        {isFetchingRepos ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-500" />
            <p className="text-[14px]">Fetching your repositories...</p>
          </div>
        ) : providerTokenSetupError ? (
          <SetupIncompleteError 
            providerTokenSetupError={providerTokenSetupError} 
            retryProviderTokenSetup={retryProviderTokenSetup || (() => {})} 
          />
        ) : githubReposError ? (
          isConnectionError ? (
            <ConnectionError 
              githubReposError={githubReposError} 
              handleConnectGithub={handleConnectGithub} 
              linkError={linkError} 
            />
          ) : (
            <GenericError 
              githubReposError={githubReposError} 
              fetchGithubRepositories={fetchGithubRepositories} 
            />
          )
        ) : (
          <div className="flex flex-col h-full">
            <GithubRepoList 
              githubRepos={githubRepos}
              githubSearchQuery={githubSearchQuery}
              selectedRepoId={selectedRepoId}
              handleAnalyze={handleAnalyze}
              viewStyle={viewStyle}
            />

            <GithubAnalysisModals 
              analysisState={analysisState}
              setAnalysisState={setAnalysisState}
              githubRepos={githubRepos}
              selectedRepoId={selectedRepoId}
              handleAnalyze={handleAnalyze}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
