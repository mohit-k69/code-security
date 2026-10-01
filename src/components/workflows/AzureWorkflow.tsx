import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useAzure, AzureRepo, AzurePullRequest } from '../../hooks/useAzure';
import { User } from '../../hooks/useAuth';
import { AzureHeader } from './azure/AzureHeader';
import { AzureConnectCard } from './azure/AzureConnectCard';
import { AzureRepoList } from './azure/AzureRepoList';
import { AzurePRList } from './azure/AzurePRList';
import { ReviewedItem } from '../../lib/reviewsService';
import { supabase } from '../../lib/supabase';
import { trackEvent } from '../../lib/posthog';

interface AzureWorkflowProps {
  user?: User | null;
  setActiveWorkflow: (workflow: any) => void;
  analysisResult?: any;
  setAnalysisResult: (result: any) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (analyzing: boolean) => void;
  reviewedItems: ReviewedItem[];
  setReviewedItems: React.Dispatch<React.SetStateAction<ReviewedItem[]>>;
  isLimitReached?: boolean;
}

export function AzureWorkflow({
  user,
  setActiveWorkflow,
  analysisResult,
  setAnalysisResult,
  isAnalyzing,
  setIsAnalyzing,
  reviewedItems,
  setReviewedItems,
  isLimitReached = false,
}: AzureWorkflowProps) {
  const [viewStyle, setViewStyle] = useState<'grid' | 'list'>('grid');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [analysisError, setAnalysisError] = useState('');

  const {
    azureRepos,
    isFetchingRepos,
    azureReposError,
    azureSearchQuery,
    setAzureSearchQuery,
    selectedRepoId,
    selectedRepo,
    azurePRs,
    isFetchingPRs,
    azurePRsError,
    selectedPR,
    selectRepo,
    selectPullRequest,
    fetchAzureRepos,
    isAzureConnected,
    clearAzureSelection,
  } = useAzure('azure', user);

  const handleAnalyzePR = async (repo: AzureRepo, pr: AzurePullRequest) => {
    if (isLimitReached) {
      setAnalysisError('You have completed all free reviews. Additional repository scans cannot be started on this account.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError('');
    setAnalysisResult(null);
    trackEvent('analysis_started', { review_type: 'azure', repo_id: repo.id, pr_id: pr.id });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const { data, error } = await supabase.functions.invoke('analyze-repository', {
        headers,
        body: {
          provider: 'azure',
          organization: repo.organization,
          project: repo.project_name,
          owner: `${repo.organization}/${repo.project_name}`,
          repo: repo.id,
          repositoryId: repo.id,
          prNumber: pr.id,
        }
      });

      if (error) {
        let msg = error.message;
        if (error.context) {
          try {
            const body = await error.context.json();
            if (body?.error) msg = body.error;
          } catch {}
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      if (data.report) {
        setAnalysisResult(data.report);
        setIsAnalyzing(false);

        const findingCount = Array.isArray(data.report.findings) ? data.report.findings.length : 0;
        trackEvent('analysis_completed', {
          review_type: 'azure',
          verdict: data.report.verdict || 'NOT_VERIFIED',
          finding_count: findingCount,
        });

        const repoName = repo.full_name;
        const verdict = data.report.verdict || 'NOT_VERIFIED';
        const localItem: ReviewedItem = {
          name: repoName,
          verdict,
          pr: pr.id,
          date: new Date(),
          result: data.report,
          reviewType: 'azure',
          repoOwner: repo.organization,
          repoName: repo.name,
        };

        setReviewedItems((prev) => [
          localItem,
          ...prev.filter(
            (p) => !(p.name === repoName && p.pr === pr.id)
          ),
        ]);
      } else {
        throw new Error('No report was returned from analysis');
      }
    } catch (err: any) {
      console.error('Azure DevOps analysis error:', err);
      const errMsg = err.message || 'Analysis failed. Please try again.';
      setAnalysisError(errMsg);
      setIsAnalyzing(false);
      trackEvent('analysis_failed', { review_type: 'azure', error: errMsg });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-2 sm:px-4 py-2 sm:py-6"
    >
      <AzureHeader
        onBack={() => {
          if (selectedRepoId) {
            clearAzureSelection();
            setAnalysisError('');
          } else {
            setActiveWorkflow('sync');
          }
        }}
        isSearchExpanded={isSearchExpanded}
        setIsSearchExpanded={setIsSearchExpanded}
        searchQuery={azureSearchQuery}
        setSearchQuery={setAzureSearchQuery}
        onRefresh={fetchAzureRepos}
        isFetching={isFetchingRepos || isFetchingPRs}
        title={selectedRepo ? selectedRepo.name : 'Azure DevOps Repositories'}
        subtitle={selectedRepo ? 'Select a pull request to start security review' : 'Select a repository to review'}
        viewStyle={viewStyle}
        setViewStyle={setViewStyle}
        showSearch={!selectedRepoId}
      />

      {/* Error state */}
      {(azureReposError || azurePRsError || analysisError) && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <span>{azureReposError || azurePRsError || analysisError}</span>
          <button
            type="button"
            onClick={() => {
              setAnalysisError('');
              fetchAzureRepos();
            }}
            className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-medium cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Flow View Switch */}
      {!isAzureConnected && azureRepos.length === 0 ? (
        <AzureConnectCard
          linkError={linkError}
          setLinkError={setLinkError}
        />
      ) : selectedRepo ? (
        <AzurePRList
          repo={selectedRepo}
          pullRequests={azurePRs}
          isFetching={isFetchingPRs}
          onBackToRepos={() => {
            clearAzureSelection();
            setAnalysisError('');
          }}
          onSelectPullRequest={selectPullRequest}
          selectedPR={selectedPR}
          onAnalyzePR={handleAnalyzePR}
          isAnalyzing={isAnalyzing}
        />
      ) : azureReposError && azureRepos.length === 0 ? (
        null
      ) : (
        <AzureRepoList
          repos={azureRepos}
          isFetching={isFetchingRepos}
          searchQuery={azureSearchQuery}
          viewStyle={viewStyle}
          onSelectRepo={selectRepo}
          selectedRepoId={selectedRepoId}
        />
      )}
    </motion.div>
  );
}
