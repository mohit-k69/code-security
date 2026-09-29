import React from 'react';
import { motion } from 'motion/react';
import { GitPullRequest, GitMerge, ArrowLeft, Loader2, Sparkles, CheckCircle2, Shield } from 'lucide-react';
import { GitlabProject, GitlabMergeRequest } from '../../../hooks/useGitlab';

interface GitlabMergeRequestListProps {
  project: GitlabProject;
  mergeRequests: GitlabMergeRequest[];
  isFetching: boolean;
  onBackToProjects: () => void;
  onSelectMergeRequest: (mr: GitlabMergeRequest) => void;
  selectedMR: GitlabMergeRequest | null;
  onAnalyzeMR: (project: GitlabProject, mr: GitlabMergeRequest) => void;
  isAnalyzing: boolean;
}

export function GitlabMergeRequestList({
  project,
  mergeRequests,
  isFetching,
  onBackToProjects,
  onSelectMergeRequest,
  selectedMR,
  onAnalyzeMR,
  isAnalyzing,
}: GitlabMergeRequestListProps) {
  return (
    <div className="w-full space-y-6">
      {/* Breadcrumb / Project header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToProjects}
            className="p-2 -ml-1 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer shrink-0"
            title="Back to all projects"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-medium">{project.path_with_namespace}</span>
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                {project.visibility}
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 truncate mt-0.5">
              {project.name}
            </h3>
          </div>
        </div>

        <div className="text-xs text-gray-500 flex items-center gap-2 sm:text-right">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Default branch: <strong className="text-gray-800">{project.default_branch}</strong></span>
        </div>
      </div>

      {/* Selected MR Action Banner */}
      {selectedMR && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#FFF5F2] border border-[#FDE3DC] rounded-2xl p-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#E24329] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#E24329] uppercase tracking-wider">
                    Merge Request Ready
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-600 font-mono">!{selectedMR.iid}</span>
                </div>
                <h4 className="text-sm font-bold text-gray-900 mt-0.5 truncate">
                  {selectedMR.title}
                </h4>
                <p className="text-xs text-gray-600 mt-1">
                  Branch: <span className="font-mono text-gray-800">{selectedMR.source_branch}</span> → <span className="font-mono text-gray-800">{selectedMR.target_branch}</span>
                </p>
              </div>
            </div>

            <button
              id="start-gitlab-review-btn"
              type="button"
              onClick={() => onAnalyzeMR(project, selectedMR)}
              disabled={isAnalyzing}
              className="px-5 py-2.5 rounded-xl bg-[#E24329] hover:bg-[#D03820] text-white text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Reviewing MR...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Review Merge Request</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Merge Requests List */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h4 className="text-sm font-semibold text-gray-900">
            Merge Requests
          </h4>
          <span className="text-xs text-gray-400">
            {mergeRequests.length} found
          </span>
        </div>

        {isFetching && mergeRequests.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-gray-400 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#E24329]" />
            <p className="text-xs font-medium text-gray-600">Loading merge requests...</p>
          </div>
        ) : mergeRequests.length === 0 ? (
          <div className="py-14 text-center bg-white border border-gray-200 rounded-2xl p-6">
            <GitPullRequest className="w-10 h-10 text-gray-300 mx-auto mb-2.5" />
            <h5 className="text-sm font-semibold text-gray-900">No merge requests found</h5>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              This GitLab project currently has no merge requests available.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {mergeRequests.map((mr) => {
              const isSelected = selectedMR?.id === mr.id;
              const isOpened = mr.state === 'opened';
              const isMerged = mr.state === 'merged';

              return (
                <div
                  key={mr.id}
                  id={`gitlab-mr-${mr.iid}`}
                  onClick={() => onSelectMergeRequest(mr)}
                  className={`w-full p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group ${
                    isSelected
                      ? 'bg-[#FFF5F2] border-[#E24329] shadow-xs'
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isOpened
                          ? 'bg-emerald-50 text-emerald-600'
                          : isMerged
                          ? 'bg-purple-50 text-purple-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {isMerged ? (
                        <GitMerge className="w-4 h-4" />
                      ) : (
                        <GitPullRequest className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-semibold text-gray-500">
                          !{mr.iid}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 group-hover:text-[#E24329] transition-colors truncate">
                          {mr.title}
                        </span>
                        {mr.draft && (
                          <span className="text-[10px] font-medium px-2 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            Draft
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-medium px-2 py-0.2 rounded-full capitalize ${
                            isOpened
                              ? 'bg-emerald-50 text-emerald-700'
                              : isMerged
                              ? 'bg-purple-50 text-purple-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {mr.state}
                        </span>
                      </div>

                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                        <span>Opened by <strong>{mr.author.name || mr.author.username}</strong></span>
                        <span>•</span>
                        <span className="font-mono text-gray-600">{mr.source_branch} → {mr.target_branch}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                    <button
                      id={`analyze-gitlab-mr-${mr.iid}-btn`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMergeRequest(mr);
                        onAnalyzeMR(project, mr);
                      }}
                      disabled={isAnalyzing}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#E24329] hover:bg-[#D03820] text-white shadow-xs'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {isAnalyzing && isSelected ? 'Reviewing...' : 'Review MR'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
