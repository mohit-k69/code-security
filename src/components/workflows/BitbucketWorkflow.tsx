import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useBitbucket, BitbucketRepo, BitbucketPullRequest } from '../../hooks/useBitbucket';
import { User } from '../../hooks/useAuth';
import { BitbucketHeader } from './bitbucket/BitbucketHeader';
import { BitbucketConnectCard } from './bitbucket/BitbucketConnectCard';
import { BitbucketRepoList } from './bitbucket/BitbucketRepoList';
import { BitbucketPRList } from './bitbucket/BitbucketPRList';
import { ReviewedItem } from '../../lib/reviewsService';
import { supabase } from '../../lib/supabase';
import { trackEvent } from '../../lib/posthog';

interface BitbucketWorkflowProps {
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

export function BitbucketWorkflow({
  user,
  setActiveWorkflow,
  analysisResult,
  setAnalysisResult,
  isAnalyzing,
  setIsAnalyzing,
  reviewedItems,
  setReviewedItems,
  isLimitReached = false,
}: BitbucketWorkflowProps) {
  const [viewStyle, setViewStyle] = useState<'grid' | 'list'>('grid');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [analysisError, setAnalysisError] = useState('');

  const {
    bitbucketRepos,
    isFetchingRepos,
    bitbucketReposError,
    bitbucketSearchQuery,
    setBitbucketSearchQuery,
    selectedRepoFullName,
    selectedRepo,
    bitbucketPRs,
    isFetchingPRs,
    bitbucketPRsError,
    selectedPR,
    selectRepo,
    selectPullRequest,
    fetchBitbucketRepos,
    isBitbucketConnected,
    clearBitbucketSelection,
    disconnectBitbucket,
    isDisconnecting,
  } = useBitbucket('bitbucket', user);

  const handleAnalyzePR = async (repo: BitbucketRepo, pr: BitbucketPullRequest) => {
    if (isLimitReached) {
      setAnalysisError('You have completed all free reviews. Additional repository scans cannot be started on this account.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError('');
    setAnalysisResult(null);
    trackEvent('analysis_started', { review_type: 'bitbucket', repo_full_name: repo.full_name, pr_id: pr.id });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const [owner, repoSlug] = repo.full_name.split('/');

      const { data, error } = await supabase.functions.invoke('analyze-repository', {
        headers,
        body: {
          provider: 'bitbucket',
          owner: owner || repo.owner || repo.workspace,
          repo: repoSlug || repo.name,
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
          review_type: 'bitbucket',
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
          reviewType: 'bitbucket',
          repoOwner: owner || repo.owner,
          repoName: repoSlug || repo.name,
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
      console.error('Bitbucket analysis error:', err);
      const errMsg = err.message || 'Analysis failed. Please try again.';
      setAnalysisError(errMsg);
      setIsAnalyzing(false);
      trackEvent('analysis_failed', { review_type: 'bitbucket', error: errMsg });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-2 sm:px-4 py-2 sm:py-6"
    >
      <BitbucketHeader
        onBack={() => {
          if (selectedRepoFullName) {
            clearBitbucketSelection();
            setAnalysisError('');
          } else {
            setActiveWorkflow('sync');
          }
        }}
        isSearchExpanded={isSearchExpanded}
        setIsSearchExpanded={setIsSearchExpanded}
        searchQuery={bitbucketSearchQuery}
        setSearchQuery={setBitbucketSearchQuery}
        onRefresh={fetchBitbucketRepos}
        isFetching={isFetchingRepos || isFetchingPRs}
        title={selectedRepo ? selectedRepo.name : 'Bitbucket Repositories'}
        subtitle={selectedRepo ? 'Select a pull request to start security review' : 'Select a repository to review'}
        viewStyle={viewStyle}
        setViewStyle={setViewStyle}
        showSearch={!selectedRepoFullName}
        disconnectBitbucket={disconnectBitbucket}
        isDisconnecting={isDisconnecting}
        isBitbucketConnected={isBitbucketConnected}
        bitbucketUsername={user?.bitbucketUsername || null}
      />

      {/* Error state */}
      {(bitbucketReposError || bitbucketPRsError || analysisError) && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <span>{bitbucketReposError || bitbucketPRsError || analysisError}</span>
          <button
            type="button"
            onClick={() => {
              setAnalysisError('');
              fetchBitbucketRepos();
            }}
            className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-medium cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Flow View Switch */}
      {!isBitbucketConnected && bitbucketRepos.length === 0 ? (
        <BitbucketConnectCard
          linkError={linkError}
          setLinkError={setLinkError}
          bitbucketUsername={user?.bitbucketUsername || null}
        />
      ) : selectedRepo ? (
        <BitbucketPRList
          repo={selectedRepo}
          pullRequests={bitbucketPRs}
          isFetching={isFetchingPRs}
          onBackToRepos={() => {
            clearBitbucketSelection();
            setAnalysisError('');
          }}
          onSelectPullRequest={selectPullRequest}
          selectedPR={selectedPR}
          onAnalyzePR={handleAnalyzePR}
          isAnalyzing={isAnalyzing}
        />
      ) : bitbucketReposError && bitbucketRepos.length === 0 ? (
        null
      ) : (
        <BitbucketRepoList
          repos={bitbucketRepos}
          isFetching={isFetchingRepos}
          searchQuery={bitbucketSearchQuery}
          viewStyle={viewStyle}
          onSelectRepo={selectRepo}
          selectedRepoFullName={selectedRepoFullName}
        />
      )}
    </motion.div>
  );
}
