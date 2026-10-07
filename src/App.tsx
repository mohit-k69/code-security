import React, { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { supabase } from './lib/supabase';
import { identifyUser, resetUser, trackPageView, trackEvent } from './lib/posthog';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useWorkflow } from './hooks/useWorkflow';
import { useAnalysis } from './hooks/useAnalysis';
import { useGithub } from './hooks/useGithub';
import { useGitlab } from './hooks/useGitlab';

// Core Layout & Home Components (Direct Imports)
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { WorkflowSelector } from './components/workflows/WorkflowSelector';

// Lazily Loaded Feature Workflows & Modals for Fast Initial Render
const Onboarding = React.lazy(() => import('./Onboarding'));
const AccountSwitcherModal = React.lazy(() => import('./components/auth/AccountSwitcherModal').then(m => ({ default: m.AccountSwitcherModal })));
const UploadWorkflow = React.lazy(() => import('./components/workflows/UploadWorkflow').then(m => ({ default: m.UploadWorkflow })));
const PasteWorkflow = React.lazy(() => import('./components/workflows/PasteWorkflow').then(m => ({ default: m.PasteWorkflow })));
const SecurityReportPanel = React.lazy(() => import('./components/workflows/SecurityReportPanel').then(m => ({ default: m.SecurityReportPanel })));
const GithubWorkflow = React.lazy(() => import('./components/workflows/GithubWorkflow').then(m => ({ default: m.GithubWorkflow })));
const GitlabWorkflow = React.lazy(() => import('./components/workflows/GitlabWorkflow').then(m => ({ default: m.GitlabWorkflow })));
const BitbucketWorkflow = React.lazy(() => import('./components/workflows/BitbucketWorkflow').then(m => ({ default: m.BitbucketWorkflow })));
const AzureWorkflow = React.lazy(() => import('./components/workflows/AzureWorkflow').then(m => ({ default: m.AzureWorkflow })));
const SyncCodeWorkflow = React.lazy(() => import('./components/workflows/SyncCodeWorkflow').then(m => ({ default: m.SyncCodeWorkflow })));
const HistoryView = React.lazy(() => import('./components/analysis/HistoryView').then(m => ({ default: m.HistoryView })));
const ProfileModal = React.lazy(() => import('./components/auth/ProfileModal').then(m => ({ default: m.ProfileModal })));
import { saveRememberedAccount } from './lib/accountSwitcher';

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
    handleStartUploadReview,
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
    githubUsername,
    disconnectGithub,
    isDisconnecting,
    clearGithubSelection,
    clearGithubCache
  } = useGithub(activeWorkflow, user);

  const {
    gitlabConnectionStatus
  } = useGitlab(activeWorkflow, user);


  // Automatically switch to the correct workflow if redirected back from OAuth Linking
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    
    // Only use localStorage/sessionStorage intents if we are actually returning from an OAuth flow
    const hasCallbackParams = 
      urlParams.has('code') || 
      hashParams.has('access_token') || 
      hashParams.has('provider_token') ||
      urlParams.has('workflow') || 
      hashParams.has('workflow');

    const workflow = urlParams.get('workflow') || hashParams.get('workflow');
    
    let sessionFlow = null;
    let localFlow = null;
    
    if (hasCallbackParams) {
      sessionFlow = window.sessionStorage?.getItem('cody_oauth_flow_provider');
      localFlow = window.localStorage?.getItem('cody_oauth_flow_provider');
    }
    
    // Clear the intent immediately so it doesn't survive across unrelated future logins
    try {
      window.sessionStorage?.removeItem('cody_oauth_flow_provider');
      window.localStorage?.removeItem('cody_oauth_flow_provider');
    } catch {}

    let targetWorkflow = (workflow || sessionFlow || localFlow)?.toLowerCase();

    // The new GitHub integration explicitly passes ?workflow=github in the URL.
    // If we only have 'github' from a stale storage intent, ignore it to prevent 
    // fresh Google logins from inappropriately landing in the GitHub workflow.
    if (!workflow && (sessionFlow === 'github' || localFlow === 'github')) {
      targetWorkflow = null;
    }

    if (targetWorkflow === 'github' || urlParams.get('workflow') === 'github') {
      setActiveWorkflow('github');
    } else if (targetWorkflow === 'gitlab' || urlParams.get('workflow') === 'gitlab') {
      setActiveWorkflow('gitlab');
    } else if (targetWorkflow === 'bitbucket' || urlParams.get('workflow') === 'bitbucket') {
      setActiveWorkflow('bitbucket');
    } else if (targetWorkflow === 'azure' || urlParams.get('workflow') === 'azure') {
      setActiveWorkflow('azure');
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
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [switchAccountError, setSwitchAccountError] = useState<string | null>(null);
  const [prefillEmail, setPrefillEmail] = useState<string>('');
  const [mobilePasteView, setMobilePasteView] = useState<'entry' | 'results'>('entry');

  // Derived states
  const hasUploadedCode = uploadedFiles.length > 0;
  const hasPastedCode = pastedCode.trim().length > 0;
  const githubConnected = selectedRepoId !== null;

  // Keep remembered account updated when authenticated user is present
  useEffect(() => {
    if (user?.email) {
      saveRememberedAccount({
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        provider: user.authProvider,
      });
      setIsSwitchingAccount(false);
    }
  }, [user]);

  const handleReturnHome = () => {
    setActiveWorkflow('none');
    setMobilePasteView('entry');
    setAnalysisResult(null);
    setIsAnalyzing(false);
    setPastedCode('');
    setUploadedFiles([]);
    setFileContents(new Map());
    clearGithubSelection();
  };

  const handleSignOut = async () => {
    try {
      if (user?.email) {
        saveRememberedAccount({
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          provider: user.authProvider,
        });
      }
      trackEvent('user_signed_out');
      resetUser();
      await supabase.auth.signOut();
      clearGithubCache();
      handleReturnHome();
      setReviewedItems([]);
      setUser(null);
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  const handleSwitchAccount = async () => {
    try {
      setSwitchAccountError(null);

      // 1. Identify currently authenticated user and record non-sensitive metadata
      if (user?.email) {
        saveRememberedAccount({
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          provider: user.authProvider,
        });
      }

      // 2. Explicitly sign out current user via existing Supabase Auth mechanism
      trackEvent('user_switch_account_initiated');
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('[AUTH] Sign-out failed during switch account:', error);
        setSwitchAccountError('Could not switch accounts. Please try again.');
        return; // Invariant: DO NOT proceed to unauthenticated / new login if sign-out fails!
      }

      // 3. Clear all client-side authenticated-user state belonging to previous account
      resetUser();
      clearGithubCache();
      handleReturnHome();
      setReviewedItems([]);
      setUser(null);

      // 4. Confirm application is now unauthenticated
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        console.warn('[AUTH] Session still present after switch account sign-out');
      }

      // 5. Only AFTER previous session is fully terminated, show account selection
      setIsSwitchingAccount(true);
    } catch (err: any) {
      console.error('[AUTH] Unexpected error in switch account:', err);
      setSwitchAccountError('Could not switch accounts. Please try again.');
    }
  };

  const handleOpenProfileModal = () => {
    setIsProfileOpen(false);
    setIsProfileModalOpen(true);
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#3f2a24] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    if (isSwitchingAccount) {
      return (
        <Suspense fallback={
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-[#3f2a24] border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <AccountSwitcherModal
            onAuthenticated={(authenticatedUser) => {
              setUser(authenticatedUser);
              setIsSwitchingAccount(false);
              setPrefillEmail('');
            }}
            onSelectAccount={(selectedEmail) => {
              setPrefillEmail(selectedEmail);
              setIsSwitchingAccount(false);
            }}
            onUseAnotherAccount={() => {
              setPrefillEmail('');
              setIsSwitchingAccount(false);
            }}
            onCancel={() => {
              setIsSwitchingAccount(false);
            }}
            error={switchAccountError}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#3f2a24] border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <Onboarding
          initialEmail={prefillEmail}
          onLogin={(loggedInUser) => {
            setPrefillEmail('');
            setIsSwitchingAccount(false);
            setUser(loggedInUser);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden relative">
      {/* Desktop & Tablet Sidebar (hidden on mobile, and hidden in Paste Code / Upload Files full-width mode) */}
      <div 
        id="desktop-sidebar-container"
        className={`${activeTab === 'new' && (activeWorkflow === 'paste' || activeWorkflow === 'upload') ? 'hidden' : 'hidden md:flex'} h-full shrink-0 transition-all duration-150`}
      >
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
              className="fixed inset-y-0 left-0 z-50 w-[225px] max-w-[85vw] h-full md:hidden shadow-2xl"
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
          onSwitchAccount={handleSwitchAccount}
          showRecoveryPrompt={showRecoveryPrompt}
          onDismissRecoveryPrompt={() => setShowRecoveryPrompt(false)}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
          showBackButton={activeTab === 'new' && (activeWorkflow === 'paste' || activeWorkflow === 'upload' || activeWorkflow === 'github' || activeWorkflow === 'gitlab' || activeWorkflow === 'sync')}
          onBack={() => {
            if (activeWorkflow === 'paste') {
              if (mobilePasteView === 'results') {
                setMobilePasteView('entry');
              } else {
                setActiveWorkflow('none');
                setMobilePasteView('entry');
              }
            } else if (activeWorkflow === 'github') {
              clearGithubSelection();
              setActiveWorkflow('sync');
            } else if (activeWorkflow === 'gitlab') {
              setActiveWorkflow('sync');
            } else if (activeWorkflow === 'sync') {
              setActiveWorkflow('none');
            } else {
              handleReturnHome();
            }
          }}
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
                const isPasteCodeMode = activeTab === 'new' && activeWorkflow === 'paste';
                const isUploadMode = activeTab === 'new' && activeWorkflow === 'upload';
                const isFullWorkspaceMode = isPasteCodeMode || isUploadMode;
                const isGithubAnalysisActive = activeWorkflow === 'github' && selectedRepoId !== null && (isAnalyzing || Boolean(analysisResult?.verdict));
                const isGitlabAnalysisActive = activeWorkflow === 'gitlab' && (isAnalyzing || Boolean(analysisResult?.verdict));
                const isBitbucketAnalysisActive = activeWorkflow === 'bitbucket' && (isAnalyzing || Boolean(analysisResult?.verdict));
                const isAzureAnalysisActive = activeWorkflow === 'azure' && (isAnalyzing || Boolean(analysisResult?.verdict));
                const isStandardAnalysisActive = activeWorkflow === 'upload' || activeWorkflow === 'paste';
                const shouldShowResultsPanel = isStandardAnalysisActive || isGithubAnalysisActive || isGitlabAnalysisActive || isBitbucketAnalysisActive || isAzureAnalysisActive;

                const leftContainerClass = isFullWorkspaceMode
                  ? `${isPasteCodeMode && mobilePasteView === 'results' ? 'hidden' : 'w-full'} lg:flex lg:w-[45%] lg:h-full lg:flex-col shrink-0 border-r border-gray-200`
                  : shouldShowResultsPanel
                    ? 'w-full lg:w-[35%] shrink-0 border-r border-gray-200'
                    : 'flex-1';

                const rightContainerClass = isFullWorkspaceMode
                  ? `${isPasteCodeMode && mobilePasteView === 'entry' ? 'hidden' : 'w-full'} lg:flex h-full flex-1 min-w-0 lg:w-[55%] shrink-0`
                  : 'h-full flex flex-1 min-w-0 w-full lg:w-[65%] shrink-0';

                const handleAnalysePasteCode = () => {
                  if (!pastedCode.trim() || isAnalyzing || isLimitReached) return;
                  setMobilePasteView('results');
                  handleCheckVibe();
                };

                return (
                  <>
                    <div className={`${isPasteCodeMode ? 'h-full flex flex-col overflow-hidden' : isUploadMode ? 'h-full flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar' : 'overflow-y-auto overflow-x-hidden custom-scrollbar'} relative bg-[#FAFAFA] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${leftContainerClass}`}>
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

                      <div className={`${isPasteCodeMode ? 'h-full flex-1 flex flex-col min-h-0 w-full p-4 sm:p-5 lg:p-6' : isUploadMode ? 'min-h-full flex flex-col items-center py-6 px-4 sm:px-6 md:px-8' : isGithubAnalysisActive ? 'min-h-full flex flex-col items-center py-8 px-4' : 'min-h-full flex flex-col items-center py-6 px-3 sm:py-8 sm:px-4 md:py-12 md:px-6'}`}>
                        <div 
                          className={`w-full ${isPasteCodeMode ? 'max-w-full' : isUploadMode ? 'max-w-full' : isGithubAnalysisActive ? 'max-w-full' : activeWorkflow === 'github' ? 'max-w-6xl' : 'max-w-4xl'} ${isPasteCodeMode ? 'h-full flex-1 flex flex-col min-h-0' : 'space-y-4 sm:space-y-6 md:space-y-8 pb-10 sm:pb-20 md:pb-32'} mx-auto`}
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
                                handleStartReview={handleStartUploadReview}
                                isAnalyzing={isAnalyzing}
                                isLimitReached={isLimitReached}
                                analysisResult={analysisResult}
                              />
                            )}

                            {activeWorkflow === 'paste' && (
                              <PasteWorkflow 
                                setActiveWorkflow={() => {
                                  setActiveWorkflow('none');
                                  setMobilePasteView('entry');
                                }}
                                pastedCode={pastedCode}
                                setPastedCode={setPastedCode}
                                handleCheckVibe={handleAnalysePasteCode}
                                isAnalyzing={isAnalyzing}
                                isLimitReached={isLimitReached}
                              />
                            )}

                            {activeWorkflow === 'sync' && (
                              <SyncCodeWorkflow 
                                setActiveWorkflow={setActiveWorkflow}
                                githubConnectionStatus={githubConnectionStatus}
                                gitlabConnectionStatus={gitlabConnectionStatus}
                                isBitbucketConnected={Boolean(user?.isBitbucketLinked)}
                                isAzureConnected={Boolean(user?.isAzureLinked)}
                              />
                            )}

                            {activeWorkflow === 'gitlab' && (
                              <GitlabWorkflow 
                                user={user}
                                setActiveWorkflow={setActiveWorkflow}
                                analysisResult={analysisResult}
                                setAnalysisResult={setAnalysisResult}
                                isAnalyzing={isAnalyzing}
                                setIsAnalyzing={setIsAnalyzing}
                                reviewedItems={reviewedItems}
                                setReviewedItems={setReviewedItems}
                                isLimitReached={isLimitReached}
                              />
                            )}

                            {activeWorkflow === 'bitbucket' && (
                              <BitbucketWorkflow 
                                user={user}
                                setActiveWorkflow={setActiveWorkflow}
                                analysisResult={analysisResult}
                                setAnalysisResult={setAnalysisResult}
                                isAnalyzing={isAnalyzing}
                                setIsAnalyzing={setIsAnalyzing}
                                reviewedItems={reviewedItems}
                                setReviewedItems={setReviewedItems}
                                isLimitReached={isLimitReached}
                              />
                            )}

                            {activeWorkflow === 'azure' && (
                              <AzureWorkflow 
                                user={user}
                                setActiveWorkflow={setActiveWorkflow}
                                analysisResult={analysisResult}
                                setAnalysisResult={setAnalysisResult}
                                isAnalyzing={isAnalyzing}
                                setIsAnalyzing={setIsAnalyzing}
                                reviewedItems={reviewedItems}
                                setReviewedItems={setReviewedItems}
                                isLimitReached={isLimitReached}
                              />
                            )}

                            {activeWorkflow === 'github' && (
                                <GithubWorkflow 
                                  user={user}
                                  setActiveWorkflow={(wf) => {
                                    clearGithubSelection();
                                    setActiveWorkflow('sync');
                                  }}
                                  isFetchingRepos={isFetchingRepos}
                                  githubReposError={githubReposError}
                                  githubConnectionStatus={githubConnectionStatus}
                                  isGithubConnected={isGithubConnected}
                                  githubUsername={githubUsername}
                                  disconnectGithub={disconnectGithub}
                                  isDisconnecting={isDisconnecting}
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
                        className={rightContainerClass}
                      >
                        {/* Mobile Results Header when in Paste Code results view */}
                        {isPasteCodeMode && (
                          <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
                            <button
                              id="mobile-paste-results-back-btn"
                              type="button"
                              onClick={() => setMobilePasteView('entry')}
                              className="flex items-center gap-1.5 text-[13px] font-medium text-[#3f2a24] hover:text-[#2c1d19] px-2.5 py-1.5 -ml-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                              aria-label="Back to code editor"
                            >
                              <ChevronLeft className="w-4 h-4 text-[#3f2a24]" />
                              <span>Edit Code</span>
                            </button>
                            <h2 className="text-[15px] font-semibold text-gray-900">Security Results</h2>
                            <div className="w-16" />
                          </div>
                        )}
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
