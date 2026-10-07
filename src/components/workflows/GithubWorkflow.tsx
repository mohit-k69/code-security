import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { GithubRepo, GithubConnectionStatus } from '../../hooks/useGithub';
import { saveUserReview, type ReviewedItem, isFreeLimitReached, FREE_REVIEW_LIMIT } from '../../lib/reviewsService';
import { type User } from '../../hooks/useAuth';
import { trackEvent } from '../../lib/posthog';

// Extracted Components
import { GithubHeader } from './github/GithubHeader';
import { SetupIncompleteError, ConnectionError, GenericError } from './github/GithubErrorStates';
import { GithubRepoList } from './github/GithubRepoList';
import { GithubAnalysisModals, AnalysisState } from './github/GithubAnalysisModals';

interface GithubWorkflowProps {
  user?: User | null;
  setActiveWorkflow: (workflow?: any) => void;
  isFetchingRepos: boolean;
  githubReposError: string;
  githubConnectionStatus?: GithubConnectionStatus;
  isGithubConnected?: boolean;
  githubUsername?: string | null;
  disconnectGithub?: () => void;
  isDisconnecting?: boolean;
  fetchGithubRepositories: () => void;
  githubSearchQuery: string;
  setGithubSearchQuery: (query: string) => void;
  githubRepos: GithubRepo[];
  selectedRepoId: number | null;
  setSelectedRepoId: (id: number | null) => void;
  providerTokenSetupError?: string | null;
  retryProviderTokenSetup?: () => void;
  reviewedItems: ReviewedItem[];
  setReviewedItems: React.Dispatch<React.SetStateAction<ReviewedItem[]>>;
  analysisResult: any;
  setAnalysisResult: (result: any) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
}

export function GithubWorkflow({
  user,
  setActiveWorkflow,
  isFetchingRepos,
  githubReposError,
  githubConnectionStatus = 'disconnected',
  isGithubConnected = false,
  githubUsername = null,
  disconnectGithub,
  isDisconnecting = false,
  fetchGithubRepositories,
  githubSearchQuery,
  setGithubSearchQuery,
  githubRepos,
  selectedRepoId,
  setSelectedRepoId,
  providerTokenSetupError,
  retryProviderTokenSetup,
  reviewedItems = [],
  setReviewedItems,
  analysisResult,
  setAnalysisResult,
  isAnalyzing,
  setIsAnalyzing
}: GithubWorkflowProps) {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [viewStyle, setViewStyle] = useState<'grid' | 'list'>('grid');
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ status: 'idle' });
  const [linkError, setLinkError] = useState<string>('');
  const [isConnectingGithub, setIsConnectingGithub] = useState<boolean>(false);

  const isLimitReached = isFreeLimitReached(reviewedItems.length);

  React.useEffect(() => {
    const handleOAuthError = (e: any) => {
      setIsConnectingGithub(false);
      if (e.detail?.message) {
        setLinkError(e.detail.message);
      }
    };
    window.addEventListener('codevibe_github_oauth_error', handleOAuthError);
    return () => {
      window.removeEventListener('codevibe_github_oauth_error', handleOAuthError);
    };
  }, []);

  const handleConnectGithub = async () => {
    if (isConnectingGithub) return;
    setIsConnectingGithub(true);
    setLinkError('');
    try {
      console.log('[GITHUB_OAUTH] BUTTON_CLICKED (Custom Integration Flow)');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setLinkError('You must be logged in to connect GitHub.');
        setIsConnectingGithub(false);
        return;
      }

      const res = await fetch('/api/functions/github-init', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!res.ok) {
        let errorMsg = 'Failed to initiate GitHub connection.';
        try {
          const body = await res.json();
          if (body.error) errorMsg = body.error;
        } catch {}
        setLinkError(errorMsg);
        setIsConnectingGithub(false);
        return;
      }

      const data = await res.json();
      if (data.url) {
        console.log('[GITHUB_OAUTH] INTEGRATION_REDIRECT_URL', data.url);
        window.location.assign(data.url);
      } else {
        setLinkError('Invalid response from server.');
        setIsConnectingGithub(false);
      }
    } catch (err: any) {
      console.error('[GITHUB_OAUTH] Error:', err);
      setIsConnectingGithub(false);
      setLinkError(err.message || 'An unexpected error occurred.');
    }
  };

  const handleAnalyze = async (repo: GithubRepo, prNumber?: number) => {
    if (isLimitReached) {
      setAnalysisState({
        status: 'limit_reached',
        message: 'You have completed all 5 free reviews. Additional repository scans cannot be started on this account.'
      });
      return;
    }

    setSelectedRepoId(repo.id);
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisState({ status: 'loading' });
    trackEvent('analysis_started', { review_type: 'github' });
    try {
      const { data, error } = await supabase.functions.invoke('analyze-repository', {
        body: { owner: repo.owner.login, repo: repo.name, prNumber }
      });
      console.log("invoke result", data);
      console.log("JSON", JSON.stringify(data, null, 2));
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data.status === 'no_prs') {
        setAnalysisState({ status: 'no_prs' });
        setIsAnalyzing(false);
      } else if (data.status === 'select_pr') {
        setAnalysisState({ status: 'select_pr', prs: data.prs });
        setIsAnalyzing(false);
      } else if (data.report) {
        setAnalysisState({ status: 'success', report: data.report });
        setAnalysisResult(data.report);
        setIsAnalyzing(false);

        const findingCount = Array.isArray(data.report.findings) ? data.report.findings.length : 0;
        trackEvent('analysis_completed', {
          review_type: 'github',
          verdict: data.report.verdict || 'NOT_VERIFIED',
          finding_count: findingCount,
        });

        const repoName = `${repo.owner.login}/${repo.name}`;
        const verdict = data.report.verdict || 'NOT_VERIFIED';
        const localItem: ReviewedItem = {
          name: repoName,
          verdict,
          pr: prNumber || null,
          date: new Date(),
          result: data.report,
          reviewType: 'github',
          repoOwner: repo.owner.login,
          repoName: repo.name,
          commitSha: data.commitSha || data.report?.commitSha || null
        };

        setReviewedItems(prev => [localItem, ...prev]);

        if (user?.id) {
          saveUserReview({
            userId: user.id,
            name: repoName,
            reviewType: 'github',
            repositoryOwner: repo.owner.login,
            repositoryName: repo.name,
            prNumber: prNumber || null,
            commitSha: data.commitSha || data.report?.commitSha || null,
            verdict,
            report: data.report
          }).then(savedItem => {
            if (savedItem?.id) {
              setReviewedItems(prev => [
                savedItem,
                ...prev.filter(item => item !== localItem)
              ]);
            }
          }).catch(err => {
            console.error('Failed to persist GitHub review to Supabase:', err);
          });
        }
      } else {
        throw new Error('Unknown response from server');
      }
    } catch (err: any) {
      console.error('Analyze Error:', err);
      trackEvent('analysis_failed', { review_type: 'github' });
      setIsAnalyzing(false);
      setAnalysisState({ status: 'error', message: err.message || 'Failed to start analysis.' });
    }
  };

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
        onRefresh={fetchGithubRepositories}
        isAnalysisMode={selectedRepoId !== null || isAnalyzing || Boolean(analysisResult?.verdict)}
        githubUsername={githubUsername}
        isConnectingGithub={isConnectingGithub}
        disconnectGithub={disconnectGithub}
        isDisconnecting={isDisconnecting}
      />
      
      <div className={`flex-1 flex flex-col ${selectedRepoId !== null ? 'max-w-full' : 'max-w-6xl'} mx-auto w-full pt-4 h-[calc(100vh-200px)]`}>
        {!isGithubConnected ? (
          <ConnectionError 
            githubReposError={githubReposError} 
            handleConnectGithub={handleConnectGithub} 
            linkError={linkError} 
            isConnecting={isConnectingGithub}
          />
        ) : isFetchingRepos ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-500" />
            <p className="text-[14px]">Fetching your repositories...</p>
          </div>
        ) : githubRepos.length > 0 ? (
          <div className="flex flex-col h-full">
            <GithubRepoList 
              githubRepos={githubRepos}
              githubSearchQuery={githubSearchQuery}
              selectedRepoId={selectedRepoId}
              handleAnalyze={handleAnalyze}
              viewStyle={viewStyle}
              isLimitReached={isLimitReached}
            />
          </div>
        ) : providerTokenSetupError ? (
          <SetupIncompleteError 
            providerTokenSetupError={providerTokenSetupError} 
            retryProviderTokenSetup={retryProviderTokenSetup || (() => {})} 
            handleConnectGithub={handleConnectGithub}
          />
        ) : githubReposError ? (
          <GenericError 
            githubReposError={githubReposError} 
            fetchGithubRepositories={fetchGithubRepositories} 
          />
        ) : (
          <div className="flex flex-col h-full">
            <GithubRepoList 
              githubRepos={githubRepos}
              githubSearchQuery={githubSearchQuery}
              selectedRepoId={selectedRepoId}
              handleAnalyze={handleAnalyze}
              viewStyle={viewStyle}
              isLimitReached={isLimitReached}
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
