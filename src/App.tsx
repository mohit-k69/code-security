import React, { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { supabase } from './lib/supabase';
import { identifyUser, resetUser, trackPageView, trackEvent } from './lib/posthog';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useWorkflow } from './hooks/useWorkflow';
import { useAnalysis } from './hooks/useAnalysis';
import { useGithub } from './hooks/useGithub';

// Core Layout & Home Components (Direct Imports)
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { WorkflowSelector } from './components/workflows/WorkflowSelector';

// Lazily Loaded Feature Workflows & Modals for Fast Initial Render
const Onboarding = React.lazy(() => import('./Onboarding'));
const UploadWorkflow = React.lazy(() => import('./components/workflows/UploadWorkflow').then(m => ({ default: m.UploadWorkflow })));
const PasteWorkflow = React.lazy(() => import('./components/workflows/PasteWorkflow').then(m => ({ default: m.PasteWorkflow })));
const SecurityReportPanel = React.lazy(() => import('./components/workflows/SecurityReportPanel').then(m => ({ default: m.SecurityReportPanel })));
const GithubWorkflow = React.lazy(() => import('./components/workflows/GithubWorkflow').then(m => ({ default: m.GithubWorkflow })));
const HistoryView = React.lazy(() => import('./components/analysis/HistoryView').then(m => ({ default: m.HistoryView })));
const ProfileModal = React.lazy(() => import('./components/auth/ProfileModal').then(m => ({ default: m.ProfileModal })));

const FallbackSpinner = () => (
  <div className="w-full h-full min-h-[300px] flex items-center justify-center">
    <div className="w-7 h-7 border-3 border-[#3f2a24] border-t-transparent rounded-full animate-spin" />
  </div>
);

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
    analysisError,
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
    filteredFindings,
    isLimitReached,
    freeReviewsLimit,
    remainingFreeReviews
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
    } else if (urlParams.get('tab') === 'reviewed' || urlParams.get('reviewId')) {
      setActiveTab('reviewed');
    }
  }, [setActiveWorkflow, setActiveTab]);

  // Identify user in PostHog upon authentication
  useEffect(() => {
    if (user?.id) {
      identifyUser(user.id);
    }
  }, [user?.id]);

  // Track page views and review history navigation
  useEffect(() => {
    if (!user) return;

    if (activeTab === 'reviewed') {
      trackPageView('/reviewed', 'Cody - Review History');
      trackEvent('review_history_opened');
    } else {
      const path = activeWorkflow === 'none' ? '/home' : `/${activeWorkflow}`;
      const title = `Cody - ${activeWorkflow === 'none' ? 'Home' : activeWorkflow.toUpperCase()}`;
      trackPageView(path, title);
    }
  }, [activeTab, activeWorkflow, user]);

  const shouldReduceMotion = useReducedMotion();

  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false);

  useEffect(() => {
    if (!user?.id || user.recoveryPromptSeenAt) return;

    const checkRecoverySetup = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) return;

        const res = await fetch('/api/auth/recovery-codes/status', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) return;

        const data = await res.json();

        if (data.success && !data.hasCodes) {
          setShowRecoveryPrompt(true);

          const seenAt = new Date().toISOString();
          const { data: updatedUser, error } = await supabase.auth.updateUser({
            data: { recovery_prompt_seen_at: seenAt },
          });

          if (!error) {
            setUser((prev) => prev
              ? {
                  ...prev,
                  recoveryPromptSeenAt:
                    updatedUser.user?.user_metadata?.recovery_prompt_seen_at || seenAt,
                }
              : prev
            );
          }
        }
      } catch (err) {
        console.warn('[RECOVERY_PROMPT] Failed to check setup status:', err);
      }
    };

    checkRecoverySetup();
  }, [user?.id, user?.recoveryPromptSeenAt, setUser]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Derived states
  const hasUploadedCode = uploadedFiles.length > 0;
  const hasPastedCode = pastedCode.trim().length > 0;
  const githubConnected = selectedRepoId !== null;

  const handleSignOut = async () => {
    try {
      trackEvent('user_signed_out');
      resetUser();
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
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#3f2a24] border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <Onboarding onLogin={setUser} />
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden relative">
      {/* Desktop & Tablet Sidebar (hidden on mobile) */}
      <div className="hidden md:flex h-full shrink-0">
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          reviewedItems={reviewedItems} 
        />
      </div>

      {/* Mobile Off-Canvas Sidebar Drawer */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <>
            <motion.div
              key="mobile-sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsMobileSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-xs"
              aria-hidden="true"
            />
            <motion.div
              key="mobile-sidebar-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] h-full md:hidden shadow-2xl"
            >
              <Sidebar 
                activeTab={activeTab} 
                setActiveTab={(tab) => {
                  setActiveTab(tab);
                  setIsMobileSidebarOpen(false);
                }} 
                reviewedItems={reviewedItems}
                onClose={() => setIsMobileSidebarOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-col flex-1 bg-gray-50 min-w-0 w-full">
        <Header 
          user={user}
          isProfileOpen={isProfileOpen}
          setIsProfileOpen={setIsProfileOpen}
          openProfileModal={handleOpenProfileModal}
          onSignOut={handleSignOut}
          showRecoveryPrompt={showRecoveryPrompt}
          onDismissRecoveryPrompt={() => setShowRecoveryPrompt(false)}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
          showBackButton={activeTab === 'new' && (activeWorkflow === 'paste' || activeWorkflow === 'upload')}
          onBack={handleReturnHome}
        />

        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'reviewed' ? (
            <Suspense fallback={<FallbackSpinner />}>
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
            </Suspense>
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

                      <div className={`min-h-full flex flex-col items-center ${isGithubAnalysisActive ? 'py-8 px-4' : 'py-6 px-3 sm:py-8 sm:px-4 md:py-12 md:px-6'}`}>
                        <div 
                          className={`w-full ${isGithubAnalysisActive ? 'max-w-full' : activeWorkflow === 'github' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto space-y-6 md:space-y-8 pb-20 md:pb-32`}
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

                          <Suspense fallback={<FallbackSpinner />}>
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
                                isLimitReached={isLimitReached}
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
                                reviewedItems={reviewedItems}
                                setReviewedItems={setReviewedItems}
                                analysisResult={analysisResult}
                                setAnalysisResult={setAnalysisResult}
                                isAnalyzing={isAnalyzing}
                                setIsAnalyzing={setIsAnalyzing}
                              />
                            )}
                          </Suspense>
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
                        <Suspense fallback={<FallbackSpinner />}>
                          <SecurityReportPanel 
                            report={analysisResult?.verdict ? analysisResult : null}
                            isAnalyzing={isAnalyzing}
                            workflow={activeWorkflow}
                            analysisError={analysisError}
                          />
                        </Suspense>
                      </motion.div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        {isProfileModalOpen && (
          <ProfileModal 
            user={user}
            setUser={setUser}
            isOpen={isProfileModalOpen}
            setIsOpen={setIsProfileModalOpen}
          />
        )}
      </Suspense>
    </div>
  );
}
