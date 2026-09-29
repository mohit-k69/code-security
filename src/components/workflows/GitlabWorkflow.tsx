import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useGitlab, GitlabProject, GitlabMergeRequest } from '../../hooks/useGitlab';
import { User } from '../../hooks/useAuth';
import { GitlabHeader } from './gitlab/GitlabHeader';
import { GitlabConnectCard } from './gitlab/GitlabConnectCard';
import { GitlabProjectList } from './gitlab/GitlabProjectList';
import { GitlabMergeRequestList } from './gitlab/GitlabMergeRequestList';

interface GitlabWorkflowProps {
  user?: User | null;
  setActiveWorkflow: (workflow: 'none' | 'upload' | 'paste' | 'github' | 'gitlab' | 'sync') => void;
}

export function GitlabWorkflow({
  user,
  setActiveWorkflow,
}: GitlabWorkflowProps) {
  const [viewStyle, setViewStyle] = useState<'grid' | 'list'>('grid');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [linkError, setLinkError] = useState('');

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
        subtitle={selectedProject ? 'Select a merge request to prepare for review' : 'Select a project to review'}
        viewStyle={viewStyle}
        setViewStyle={setViewStyle}
        showSearch={!selectedProjectId}
      />

      {/* Error state */}
      {(gitlabProjectsError || gitlabMRsError) && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
          <span>{gitlabProjectsError || gitlabMRsError}</span>
          <button
            type="button"
            onClick={fetchGitlabProjects}
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
          onBackToProjects={clearGitlabSelection}
          onSelectMergeRequest={selectMergeRequest}
          selectedMR={selectedMR}
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
