import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, AlertTriangle, Check, X, GitPullRequest } from 'lucide-react';
import { GithubRepo } from '../../../hooks/useGithub';

export type AnalysisState = 
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no_prs' }
  | { status: 'select_pr'; prs: any[] }
  | { status: 'success'; report: any }
  | { status: 'error'; message: string };

interface GithubAnalysisModalsProps {
  analysisState: AnalysisState;
  setAnalysisState: (state: AnalysisState) => void;
  githubRepos: GithubRepo[];
  selectedRepoId: number | null;
  handleAnalyze: (repo: GithubRepo, prNumber?: number) => void;
}

export function GithubAnalysisModals({
  analysisState,
  setAnalysisState,
  githubRepos,
  selectedRepoId,
  handleAnalyze
}: GithubAnalysisModalsProps) {
  const showModal = ['no_prs', 'select_pr', 'error'].includes(analysisState.status);

  return (
    <AnimatePresence>
      {showModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm p-4"
        >
          {analysisState.status === 'no_prs' && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 flex flex-col items-center max-w-sm w-full"
            >
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <GitPullRequest className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-gray-900 font-semibold text-lg mb-2">No Pull Requests</h3>
              <p className="text-gray-500 text-sm text-center mb-6">No open Pull Requests were found for this repository.</p>
              <button
                onClick={() => setAnalysisState({ status: 'idle' })}
                className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </motion.div>
          )}

          {analysisState.status === 'select_pr' && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col max-w-lg w-full max-h-[80vh] overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-gray-900 font-semibold text-lg">Select a Pull Request</h3>
                  <p className="text-gray-500 text-sm mt-1">Multiple open PRs found. Which one would you like to analyze?</p>
                </div>
                <button onClick={() => setAnalysisState({ status: 'idle' })} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-2 overflow-y-auto custom-scrollbar">
                {analysisState.prs.map((pr: any) => (
                  <button
                    key={pr.id}
                    onClick={() => handleAnalyze(githubRepos.find(r => r.id === selectedRepoId)!, pr.number)}
                    className="w-full text-left p-4 hover:bg-gray-50 rounded-xl transition-colors flex items-start gap-4 border border-transparent hover:border-gray-200"
                  >
                    <img src={pr.user.avatar_url} alt="Author" className="w-10 h-10 rounded-full border border-gray-200" />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-gray-900 font-medium text-sm truncate">{pr.title}</h4>
                      <p className="text-gray-500 text-xs mt-1">#{pr.number} opened by {pr.user.login}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {analysisState.status === 'error' && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 flex flex-col items-center max-w-sm w-full"
            >
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-gray-900 font-semibold text-lg mb-2">Analysis Failed</h3>
              <p className="text-gray-500 text-sm text-center mb-6">{analysisState.message}</p>
              <button
                onClick={() => setAnalysisState({ status: 'idle' })}
                className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-medium text-sm hover:bg-gray-800 transition-colors"
              >
                Try Again
              </button>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
