import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Search, ChevronDown, FileText, ChevronRight } from 'lucide-react';
import { supabase } from './lib/supabase';
import Onboarding from './Onboarding';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useWorkflow } from './hooks/useWorkflow';
import { useAnalysis } from './hooks/useAnalysis';
import { useGithub } from './hooks/useGithub';

// Components
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { WorkflowSelector } from './components/workflows/WorkflowSelector';
import { UploadWorkflow } from './components/workflows/UploadWorkflow';
import { PasteWorkflow } from './components/workflows/PasteWorkflow';
import { SecurityReportPanel } from './components/workflows/SecurityReportPanel';
import { GithubWorkflow } from './components/workflows/GithubWorkflow';
import { HistoryView } from './components/analysis/HistoryView';
import { ProfileModal } from './components/auth/ProfileModal';

export default function App() {
  const { user, setUser, isInitializing, providerTokenSetupError, retryProviderTokenSetup } = useAuth();
  const {
    activeWorkflow,
    setActiveWorkflow,
    activeTab,
    setActiveTab,
    isSearchExpanded,
    setIsSearchExpanded,
    isFilterOpen,
    setIsFilterOpen,
    filterOption,
    setFilterOption,
    isProfileOpen,
    setIsProfileOpen
  } = useWorkflow();

  const {
    isAnalyzing,
    setIsAnalyzing,
    analysisResult,
    setAnalysisResult,
    activeCategory,
    setActiveCategory,
    expandedFinding,
    setExpandedFinding,
    pastedCode,
    setPastedCode,
    uploadedFiles,
    setUploadedFiles,
    fileContents,
    setFileContents,
    reviewedItems,
    setReviewedItems,
    handleFileUpload,
    handleCheckVibe,
    filteredFindings
  } = useAnalysis(user);

  const {
    githubRepos,
    isFetchingRepos,
    githubReposError,
    githubSearchQuery,
    setGithubSearchQuery,
    selectedRepoId,
    setSelectedRepoId,
    fetchGithubRepositories,
    githubConnectionStatus,
    isGithubConnected,
    clearGithubSelection,
    clearGithubCache
  } = useGithub(activeWorkflow, user);

  // Automatically switch to GitHub workflow if redirected back from OAuth Manual Linking
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('workflow') === 'github') {
      setActiveWorkflow('github');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [setActiveWorkflow]);

  const shouldReduceMotion = useReducedMotion();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Derived states
  const hasUploadedCode = uploadedFiles.length > 0;
  const hasPastedCode = pastedCode.trim().length > 0;
  const githubConnected = selectedRepoId !== null;

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      clearGithubCache();
      setUser(null);
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  const handleOpenProfileModal = () => {
    setIsProfileOpen(false);
    setIsProfileModalOpen(true);
  };

  const handleReturnHome = () => {
    setActiveWorkflow('none');
    setAnalysisResult(null);
    setIsAnalyzing(false);
    setPastedCode('');
    setUploadedFiles([]);
    setFileContents([]);
    clearGithubSelection();
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#3f2a24] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Onboarding onLogin={setUser} />;
  }

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        reviewedItems={reviewedItems} 
      />

      <div className="flex flex-col flex-1 bg-gray-50">
        <Header 
          user={user}
          isProfileOpen={isProfileOpen}
          setIsProfileOpen={setIsProfileOpen}
          openProfileModal={handleOpenProfileModal}
          onSignOut={handleSignOut}
        />

        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'reviewed' ? (
            <HistoryView
              reviewedItems={reviewedItems}
              isSearchExpanded={isSearchExpanded}
              setIsSearchExpanded={setIsSearchExpanded}
              isFilterOpen={isFilterOpen}
              setIsFilterOpen={setIsFilterOpen}
              filterOption={filterOption}
              setFilterOption={setFilterOption}
              setActiveTab={setActiveTab}
              setAnalysisResult={setAnalysisResult}
            />
          ) : (
            <div className="flex-1 flex min-h-0 bg-white w-full">
              {(() => {
                const isGithubAnalysisActive = activeWorkflow === 'github' && selectedRepoId !== null && (isAnalyzing || Boolean(analysisResult?.verdict));
                const isStandardAnalysisActive = activeWorkflow === 'upload' || activeWorkflow === 'paste';
                const shouldShowResultsPanel = isStandardAnalysisActive || isGithubAnalysisActive;

                let leftContainerClass = 'flex-1';
                if (isGithubAnalysisActive) {
                  leftContainerClass = 'w-full lg:w-[30%] shrink-0 border-r border-gray-200';
                } else if (isStandardAnalysisActive) {
                  leftContainerClass = 'flex-1 border-r border-gray-200';
                }

                return (
                  <>
                    <div className={`overflow-y-auto overflow-x-hidden custom-scrollbar relative bg-[#FAFAFA] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${leftContainerClass}`}>
                      {/* Scanning Line Animation during active analysis */}
                      {isAnalyzing && (
                        <div 
                          className="absolute inset-0 pointer-events-none overflow-hidden z-30" 
                          aria-hidden="true"
                        >
                          {shouldReduceMotion ? (
                            <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-500/60 shadow-[0_0_8px_1px_rgba(59,130,246,0.4)]" />
                          ) : (
                            <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent shadow-[0_0_12px_2px_rgba(59,130,246,0.6)] animate-scan-line" />
                          )}
                        </div>
                      )}

                      <div className={`min-h-full flex flex-col items-center ${isGithubAnalysisActive ? 'py-8 px-4' : 'py-12 px-6'}`}>
                        <div 
                          className={`w-full ${isGithubAnalysisActive ? 'max-w-full' : activeWorkflow === 'github' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto space-y-8 pb-32`}
                          onClick={activeWorkflow === 'none' ? handleReturnHome : undefined}
                        >
                          {activeWorkflow === 'none' && (
                          <WorkflowSelector 
                            setActiveWorkflow={setActiveWorkflow}
                            hasUploadedCode={hasUploadedCode}
                            uploadedFilesCount={uploadedFiles.length}
                            hasPastedCode={hasPastedCode}
                            githubConnected={githubConnected}
                            onClearState={handleReturnHome}
                          />
                        )}

                        {activeWorkflow === 'upload' && (
                          <UploadWorkflow 
                            setActiveWorkflow={handleReturnHome}
                            uploadedFiles={uploadedFiles}
                            setUploadedFiles={setUploadedFiles}
                            setFileContents={setFileContents}
                            handleFileUpload={handleFileUpload}
                          />
                        )}

                        {activeWorkflow === 'paste' && (
                          <PasteWorkflow 
                            setActiveWorkflow={handleReturnHome}
                            pastedCode={pastedCode}
                            setPastedCode={setPastedCode}
                            handleCheckVibe={handleCheckVibe}
                            isAnalyzing={isAnalyzing}
                          />
                        )}

                        {activeWorkflow === 'github' && (
                          <GithubWorkflow 
                            user={user}
                            setActiveWorkflow={handleReturnHome}
                            isFetchingRepos={isFetchingRepos}
                            githubReposError={githubReposError}
                            githubConnectionStatus={githubConnectionStatus}
                            isGithubConnected={isGithubConnected}
                            fetchGithubRepositories={fetchGithubRepositories}
                            githubSearchQuery={githubSearchQuery}
                            setGithubSearchQuery={setGithubSearchQuery}
                            githubRepos={githubRepos}
                            selectedRepoId={selectedRepoId}
                            setSelectedRepoId={setSelectedRepoId}
                            providerTokenSetupError={providerTokenSetupError}
                            retryProviderTokenSetup={retryProviderTokenSetup}
                            setReviewedItems={setReviewedItems}
                            analysisResult={analysisResult}
                            setAnalysisResult={setAnalysisResult}
                            isAnalyzing={isAnalyzing}
                            setIsAnalyzing={setIsAnalyzing}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Analysis Results Panel */}
                  {shouldShowResultsPanel && (
                    <motion.div
                      key={isGithubAnalysisActive ? 'github-results' : 'standard-results'}
                      initial={shouldReduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className={`h-full flex shrink-0 ${isGithubAnalysisActive ? 'flex-1 min-w-0 w-full lg:w-[70%]' : 'w-[420px] lg:w-[460px]'}`}
                    >
                      <SecurityReportPanel 
                        report={analysisResult?.verdict ? analysisResult : null}
                        isAnalyzing={isAnalyzing}
                      />
                    </motion.div>
                  )}
                </>
              );
            })()}
          </div>
          )}
        </div>
      </div>

      <ProfileModal 
        user={user}
        setUser={setUser}
        isOpen={isProfileModalOpen}
        setIsOpen={setIsProfileModalOpen}
      />
    </div>
  );
}
