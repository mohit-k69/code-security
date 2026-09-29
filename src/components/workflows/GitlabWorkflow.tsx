import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useGitlab, GitlabProject, GitlabMergeRequest } from '../../hooks/useGitlab';
import { User } from '../../hooks/useAuth';
import { GitlabHeader } from './gitlab/GitlabHeader';
import { GitlabConnectCard } from './gitlab/GitlabConnectCard';
import { GitlabProjectList } from './gitlab/GitlabProjectList';
import { GitlabMergeRequestList } from './gitlab/GitlabMergeRequestList';
import { ReviewedItem } from '../../lib/reviewsService';
import { supabase } from '../../lib/supabase';
import { trackEvent } from '../../lib/posthog';

interface GitlabWorkflowProps {
  user?: User | null;
  setActiveWorkflow: (workflow: 'none' | 'upload' | 'paste' | 'github' | 'gitlab' | 'sync') => void;
  analysisResult?: any;
  setAnalysisResult: (result: any) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (analyzing: boolean) => void;
  reviewedItems: ReviewedItem[];
  setReviewedItems: React.Dispatch<React.SetStateAction<ReviewedItem[]>>;
  isLimitReached?: boolean;
}

export function GitlabWorkflow({
  user,
  setActiveWorkflow,
  analysisResult,
  setAnalysisResult,
  isAnalyzing,
  setIsAnalyzing,
  reviewedItems,
  setReviewedItems,
  isLimitReached = false,
}: GitlabWorkflowProps) {
  const [viewStyle, setViewStyle] = useState<'grid' | 'list'>('grid');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [analysisError, setAnalysisError] = useState('');

  const {
    gitlabProjects,
    isFetchingProjects,
    gitlabProjectsError,
    gitlabSearchQuery,
    setGitlabSearchQuery,
    selectedProjectId,
    selectedProject,
    gitlabMergeRequests,
    isFetchingMRs,
    gitlabMRsError,
    selectedMR,
    selectProject,
    selectMergeRequest,
    fetchGitlabProjects,
    isGitlabConnected,
    clearGitlabSelection,
  } = useGitlab('gitlab', user);

  const handleAnalyzeMR = async (project: GitlabProject, mr: GitlabMergeRequest) => {
    if (isLimitReached) {
      setAnalysisError('You have completed all free reviews. Additional repository scans cannot be started on this account.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError('');
    setAnalysisResult(null);
    trackEvent('analysis_started', { review_type: 'gitlab', project_id: project.id, mr_iid: mr.iid });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const { data, error } = await supabase.functions.invoke('analyze-repository', {
        headers,
        body: {
          provider: 'gitlab',
          projectId: project.id,
          owner: project.namespace?.path || '',
          repo: project.path_with_namespace || project.name,
          prNumber: mr.iid,
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
          review_type: 'gitlab',
          verdict: data.report.verdict || 'NOT_VERIFIED',
          finding_count: findingCount,
        });

        const projectName = project.path_with_namespace || project.name;
        const verdict = data.report.verdict || 'NOT_VERIFIED';
        const localItem: ReviewedItem = {
          name: projectName,
          verdict,
          pr: mr.iid,
          date: new Date(),
          result: data.report,
          reviewType: 'gitlab',
          repoOwner: project.namespace?.path || '',
          repoName: project.name,
        };

        setReviewedItems((prev) => [
          localItem,
          ...prev.filter(
            (p) => !(p.name === projectName && p.pr === mr.iid)
          ),
        ]);
      } else {
        throw new Error('No report was returned from analysis');
      }
    } catch (err: any) {
      console.error('GitLab analysis error:', err);
      const errMsg = err.message || 'Analysis failed. Please try again.';
      setAnalysisError(errMsg);
      setIsAnalyzing(false);
      trackEvent('analysis_failed', { review_type: 'gitlab', error: errMsg });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-2 sm:px-4 py-2 sm:py-6"
    >
      <GitlabHeader
        onBack={() => {
          if (selectedProjectId) {
            clearGitlabSelection();
            setAnalysisError('');
          } else {
            setActiveWorkflow('sync');
          }
        }}
        isSearchExpanded={isSearchExpanded}
        setIsSearchExpanded={setIsSearchExpanded}
        searchQuery={gitlabSearchQuery}
        setSearchQuery={setGitlabSearchQuery}
        onRefresh={fetchGitlabProjects}
        isFetching={isFetchingProjects || isFetchingMRs}
        title={selectedProject ? selectedProject.name : 'GitLab Projects'}
        subtitle={selectedProject ? 'Select a merge request to start security review' : 'Select a project to review'}
        viewStyle={viewStyle}
        setViewStyle={setViewStyle}
        showSearch={!selectedProjectId}
      />

      {/* Error state */}
      {(gitlabProjectsError || gitlabMRsError || analysisError) && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <span>{gitlabProjectsError || gitlabMRsError || analysisError}</span>
          <button
            type="button"
            onClick={() => {
              setAnalysisError('');
              fetchGitlabProjects();
            }}
            className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-medium cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Flow View Switch */}
      {!isGitlabConnected && gitlabProjects.length === 0 ? (
        <GitlabConnectCard
          linkError={linkError}
          setLinkError={setLinkError}
        />
      ) : selectedProject ? (
        <GitlabMergeRequestList
          project={selectedProject}
          mergeRequests={gitlabMergeRequests}
          isFetching={isFetchingMRs}
          onBackToProjects={() => {
            clearGitlabSelection();
            setAnalysisError('');
          }}
          onSelectMergeRequest={selectMergeRequest}
          selectedMR={selectedMR}
          onAnalyzeMR={handleAnalyzeMR}
          isAnalyzing={isAnalyzing}
        />
      ) : (
        <GitlabProjectList
          projects={gitlabProjects}
          isFetching={isFetchingProjects}
          searchQuery={gitlabSearchQuery}
          viewStyle={viewStyle}
          onSelectProject={selectProject}
          selectedProjectId={selectedProjectId}
        />
      )}
    </motion.div>
  );
}
