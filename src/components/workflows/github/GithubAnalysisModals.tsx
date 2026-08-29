import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, AlertTriangle, Check, X, GitPullRequest } from 'lucide-react';
import { GithubRepo } from '../../../hooks/useGithub';

export type AnalysisState = 
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no_prs' }
  | { status: 'select_pr'; prs: any[] }
  | { status: 'analysis_data_ready'; metadata: any }
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
  return (
    <AnimatePresence>
      {analysisState.status !== 'idle' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm p-4"
        >
          {analysisState.status === 'loading' && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 flex flex-col items-center max-w-sm w-full"
            >
              <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-4" />
              <h3 className="text-gray-900 font-semibold text-lg mb-2">Orchestrating Analysis...</h3>
              <p className="text-gray-500 text-sm text-center">Contacting GitHub securely to fetch your repository data.</p>
            </motion.div>
          )}

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

          {analysisState.status === 'analysis_data_ready' && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 flex flex-col items-center max-w-md w-full"
            >
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center border-2 border-emerald-200 mb-4 text-emerald-600">
                <Check className="w-8 h-8" />
              </div>
              <h3 className="text-gray-900 font-semibold text-xl mb-2 text-center">Analysis Complete!</h3>
              <p className="text-gray-500 text-sm text-center mb-4">
                {analysisState.metadata?.verdict 
                  ? `Security Check Verdict: ${analysisState.metadata.verdict}`
                  : 'Reviewing security vulnerabilities and code vibe.'}
              </p>
              <div className="w-full bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center justify-center gap-2 text-emerald-700 text-sm font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                Loading results into your dashboard...
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
