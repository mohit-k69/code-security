import React from 'react';
import { motion } from 'motion/react';
import { GitPullRequest, GitMerge, ArrowLeft, Loader2, CheckCircle2, Shield } from 'lucide-react';
import { AzureRepo, AzurePullRequest } from '../../../hooks/useAzure';

interface AzurePRListProps {
  repo: AzureRepo;
  pullRequests: AzurePullRequest[];
  isFetching: boolean;
  onBackToRepos: () => void;
  onSelectPullRequest: (pr: AzurePullRequest) => void;
  selectedPR: AzurePullRequest | null;
  onAnalyzePR: (repo: AzureRepo, pr: AzurePullRequest) => void;
  isAnalyzing: boolean;
}

export function AzurePRList({
  repo,
  pullRequests,
  isFetching,
  onBackToRepos,
  onSelectPullRequest,
  selectedPR,
  onAnalyzePR,
  isAnalyzing,
}: AzurePRListProps) {
  return (
    <div className="w-full space-y-6">
      {/* Breadcrumb / Repo header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToRepos}
            className="p-2 -ml-1 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer shrink-0"
            title="Back to all repositories"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-medium">{repo.organization} / {repo.project_name}</span>
              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                Private
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 truncate mt-0.5">
              {repo.name}
            </h3>
          </div>
        </div>

        <div className="text-xs text-gray-500 flex items-center gap-2 sm:text-right">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Default branch: <strong className="text-gray-800">{repo.default_branch}</strong></span>
        </div>
      </div>

      {/* Selected PR Action Banner */}
      {selectedPR && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#EBF6FF] border border-[#CCE7FF] rounded-2xl p-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#0078D4] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#0078D4] uppercase tracking-wider">
                    Pull Request Ready
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-600 font-mono">#{selectedPR.id}</span>
                </div>
                <h4 className="text-sm font-bold text-gray-900 mt-0.5 truncate">
                  {selectedPR.title}
                </h4>
                <p className="text-xs text-gray-600 mt-1">
                  Branch: <span className="font-mono text-gray-800">{selectedPR.source_branch}</span> → <span className="font-mono text-gray-800">{selectedPR.target_branch}</span>
                </p>
              </div>
            </div>

            <button
              id="start-azure-review-btn"
              type="button"
              onClick={() => onAnalyzePR(repo, selectedPR)}
              disabled={isAnalyzing}
              className="px-5 py-2.5 rounded-xl bg-[#0078D4] hover:bg-[#006CBE] text-white text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Reviewing PR...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Review Pull Request</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Pull Requests List */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h4 className="text-sm font-semibold text-gray-900">
            Pull Requests
          </h4>
          <span className="text-xs text-gray-400">
            {pullRequests.length} found
          </span>
        </div>

        {isFetching && pullRequests.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-gray-400 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#0078D4]" />
            <p className="text-xs font-medium text-gray-600">Loading pull requests...</p>
          </div>
        ) : pullRequests.length === 0 ? (
          <div className="py-14 text-center bg-white border border-gray-200 rounded-2xl p-6">
            <GitPullRequest className="w-10 h-10 text-gray-300 mx-auto mb-2.5" />
            <h5 className="text-sm font-semibold text-gray-900">No active pull requests found</h5>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              This Azure DevOps repository currently has no active pull requests.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pullRequests.map((pr) => {
              const isSelected = selectedPR?.id === pr.id;
              const isOpened = pr.state === 'open';

              return (
                <div
                  key={pr.id}
                  id={`azure-pr-${pr.id}`}
                  onClick={() => onSelectPullRequest(pr)}
                  className={`w-full p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group ${
                    isSelected
                      ? 'bg-[#EBF6FF] border-[#0078D4] shadow-xs'
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isOpened
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <GitPullRequest className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-semibold text-gray-500">
                          #{pr.id}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 group-hover:text-[#0078D4] transition-colors truncate">
                          {pr.title}
                        </span>
                        <span
                          className={`text-[10px] font-medium px-2 py-0.2 rounded-full capitalize ${
                            isOpened
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {pr.state}
                        </span>
                      </div>

                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                        <span>Opened by <strong>{pr.author.name || pr.author.username}</strong></span>
                        <span>•</span>
                        <span className="font-mono text-gray-600">{pr.source_branch} → {pr.target_branch}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                    <button
                      id={`analyze-azure-pr-${pr.id}-btn`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPullRequest(pr);
                        onAnalyzePR(repo, pr);
                      }}
                      disabled={isAnalyzing}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#0078D4] hover:bg-[#006CBE] text-white shadow-xs'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {isAnalyzing && isSelected ? 'Reviewing...' : 'Review PR'}
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
