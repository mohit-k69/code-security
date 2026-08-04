import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Loader2, AlertTriangle, Search, Github, Lock, Globe, CodeXml, Clock, Check, X, GitPullRequest } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { GithubRepo } from '../../hooks/useGithub';

type AnalysisState = 
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'no_prs' }
  | { status: 'select_pr'; prs: any[] }
  | { status: 'analysis_data_ready'; metadata: any }
  | { status: 'error'; message: string };

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
  retryProviderTokenSetup
}: GithubWorkflowProps) {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    } else if (!isSearchExpanded) {
      setGithubSearchQuery('');
    }
  }, [isSearchExpanded, setGithubSearchQuery]);

  const [analysisState, setAnalysisState] = useState<AnalysisState>({ status: 'idle' });
  const [linkError, setLinkError] = useState<string>('');

  const handleConnectGithub = async () => {
    setLinkError('');
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'github',
        options: {
          redirectTo: window.location.origin + '?workflow=github'
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
    } catch (err: any) {
      console.error('Failed to link GitHub:', err);
      setLinkError('An unexpected error occurred while connecting GitHub.');
    }
  };

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
      } else if (data.status === 'analysis_data_ready') {
        setAnalysisState({ status: 'analysis_data_ready', metadata: data.metadata });
      } else {
        throw new Error('Unknown response from server');
      }
    } catch (err: any) {
      console.error('Analyze Error:', err);
      setAnalysisState({ status: 'error', message: err.message || 'Failed to start analysis.' });
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col h-full"
    >
      <div className="flex items-center justify-between mb-8 relative w-full h-10" ref={searchContainerRef}>
        <AnimatePresence>
          {!isSearchExpanded && (
            <motion.div
              key="title"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3 absolute left-0 top-1/2 -translate-y-1/2"
            >
              <button onClick={() => setActiveWorkflow('none')} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h2 className="text-[18px] font-semibold text-gray-900">GitHub Repository</h2>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute right-0 flex items-center justify-end h-10 top-1/2 -translate-y-1/2">
          <AnimatePresence>
            {isSearchExpanded ? (
              <motion.div
                key="search-input"
                initial={{ width: 40, opacity: 0 }}
                animate={{ width: 624, maxWidth: 'calc(100vw - 32px)', opacity: 1 }}
                exit={{ width: 40, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="relative h-full overflow-hidden rounded-full"
              >
                <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 z-10" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={githubSearchQuery}
                  onChange={(e) => setGithubSearchQuery(e.target.value)}
                  placeholder="Search repositories..."
                  className="w-full h-full bg-white border border-gray-200 rounded-full pl-11 pr-4 text-[14px] outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 shadow-sm"
                />
              </motion.div>
            ) : (
              <motion.button
                key="search-button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsSearchExpanded(true)}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors h-10 w-10 flex items-center justify-center"
              >
                <Search className="w-5 h-5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full pt-4 h-[calc(100vh-200px)]">
        {isFetchingRepos ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-500" />
            <p className="text-[14px]">Fetching your repositories...</p>
          </div>
        ) : providerTokenSetupError ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 border border-red-100 shadow-sm">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-[18px] font-semibold text-gray-900 mb-2">GitHub Setup Incomplete</h3>
            <p className="text-[14px] text-gray-500 max-w-md mb-6">{providerTokenSetupError}</p>
            <button 
              onClick={retryProviderTokenSetup}
              className="px-6 py-2.5 bg-gray-900 text-white rounded-full text-[14px] font-medium hover:bg-gray-800 transition-colors shadow-sm"
            >
              Retry Setup
            </button>
          </div>
        ) : githubReposError ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            {githubReposError.toLowerCase().includes('connect') || githubReposError.toLowerCase().includes('oauth') ? (
              <div className="flex flex-col items-center max-w-md px-4">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-200 shadow-sm">
                  <Github className="w-8 h-8 text-gray-700" />
                </div>
                <h3 className="text-[18px] font-semibold text-gray-900 mb-2">GitHub isn't connected.</h3>
                <p className="text-[14px] text-gray-500 mb-6">Connect your GitHub account to directly analyze your repositories and pull requests.</p>
                <button 
                  onClick={handleConnectGithub}
                  className="px-6 py-2.5 bg-gray-900 text-white rounded-full text-[14px] font-medium hover:bg-gray-800 transition-colors shadow-sm mb-4"
                >
                  {githubReposError.toLowerCase().includes('reconnect') ? 'Reconnect GitHub' : 'Connect GitHub'}
                </button>
                {linkError && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-600 text-left w-full mt-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{linkError}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-[16px] font-semibold text-gray-900 mb-2">Failed to load repositories</h3>
                <p className="text-[14px] text-gray-500 max-w-md">{githubReposError}</p>
                <button 
                  onClick={fetchGithubRepositories}
                  className="mt-6 px-4 py-2 bg-white border border-gray-200 rounded-lg text-[13px] font-medium hover:bg-gray-50 transition-colors"
                >
                  Try Again
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {githubRepos.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                <Github className="w-12 h-12 text-gray-300 mb-4" />
                <p className="text-[14px]">No repositories found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pb-12 pr-2 pt-3 pl-1 custom-scrollbar">
                {githubRepos
                  .filter(repo => {
                    if (!githubSearchQuery.trim()) return true;
                    const terms = githubSearchQuery.toLowerCase().split(/\s+/);
                    const searchableText = `${repo.name} ${repo.description || ''} ${repo.language || ''}`.toLowerCase();
                    return terms.every(term => searchableText.includes(term));
                  })
                  .map((repo) => (
                  <div 
                    key={repo.id}
                    className={`relative bg-white border rounded-xl p-5 flex flex-col gap-4 transition-all hover:shadow-md ${
                      selectedRepoId === repo.id ? 'border-emerald-500 ring-1 ring-emerald-500 shadow-sm' : 'border-gray-200'
                    }`}
                  >
                    {selectedRepoId === repo.id && (
                      <div className="absolute -top-2.5 -right-2.5 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow-sm border-2 border-white">
                        <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3 min-w-0">
                        <img src={repo.owner.avatar_url} alt="Owner" className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 border border-gray-200" />
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-[15px] font-semibold text-gray-900 truncate" title={repo.name}>{repo.name}</h4>
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium flex items-center gap-1 flex-shrink-0">
                              {repo.private ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                              {repo.private ? 'Private' : 'Public'}
                            </span>
                          </div>
                          <p className="text-[13px] text-gray-500 truncate mt-0.5" title={repo.full_name}>{repo.full_name}</p>
                        </div>
                      </div>
                    </div>

                    <p className="text-[13px] text-gray-600 line-clamp-2 min-h-[40px]">
                      {repo.description || <span className="italic text-gray-400">No description provided.</span>}
                    </p>

                    <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-4 text-[12px] text-gray-500 justify-end w-full">
                        {repo.language && (
                          <span className="flex items-center gap-1.5">
                            <CodeXml className="w-3.5 h-3.5" />
                            {repo.language}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(repo.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-end gap-2 w-full">
                        <button 
                          onClick={() => handleAnalyze(repo)}
                          className="px-4 py-1 rounded-full text-[12px] font-medium transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
                        >
                          Analyze
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* --- Modals for Analysis Flow --- */}
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
                      className="bg-white rounded-2xl shadow-xl border border-gray-200 p-10 flex flex-col items-center max-w-md w-full"
                    >
                      <div className="relative mb-8">
                        <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-20"></div>
                        <div className="relative bg-emerald-50 w-20 h-20 rounded-full flex items-center justify-center border-4 border-white shadow-sm">
                          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                        </div>
                      </div>
                      <h3 className="text-gray-900 font-semibold text-xl mb-3 text-center">Analyzing Pull Request #{analysisState.metadata.prNumber}</h3>
                      <div className="flex flex-col gap-2 w-full text-sm font-medium">
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="flex items-center gap-3 text-emerald-600 bg-emerald-50 p-3 rounded-lg">
                          <Check className="w-4 h-4" /> Connecting to GitHub
                        </motion.div>
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.5 }} className="flex items-center gap-3 text-emerald-600 bg-emerald-50 p-3 rounded-lg">
                          <Check className="w-4 h-4" /> Fetching Pull Request
                        </motion.div>
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2.5 }} className="flex items-center gap-3 text-emerald-600 bg-emerald-50 p-3 rounded-lg">
                          <Check className="w-4 h-4" /> Collecting changed files
                        </motion.div>
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 3.5 }} className="flex items-center gap-3 text-emerald-600 bg-emerald-50 p-3 rounded-lg">
                          <Check className="w-4 h-4" /> Preparing analysis
                        </motion.div>
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 4.5 }} className="flex items-center gap-3 text-gray-400 p-3">
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> Waiting for AI analysis...
                        </motion.div>
                      </div>
                      <button
                        onClick={() => setAnalysisState({ status: 'idle' })}
                        className="mt-8 text-xs text-gray-400 hover:text-gray-600 underline"
                      >
                        Cancel Analysis
                      </button>
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
            
          </div>
        )}
      </div>
    </motion.div>
  );
}
