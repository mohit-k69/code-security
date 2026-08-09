import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
import { GithubWorkflow } from './components/workflows/GithubWorkflow';
import { AnalysisDashboard } from './components/analysis/AnalysisDashboard';
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
    analysisResult,
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
    handleFileUpload,
    handleCheckVibe,
    filteredFindings
  } = useAnalysis();

  const {
    githubRepos,
    isFetchingRepos,
    githubReposError,
    githubSearchQuery,
    setGithubSearchQuery,
    selectedRepoId,
    setSelectedRepoId,
    fetchGithubRepositories,
    isGithubConnected
  } = useGithub(activeWorkflow);

  // Automatically switch to GitHub workflow if redirected back from OAuth Manual Linking
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('workflow') === 'github') {
      setActiveWorkflow('github');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [setActiveWorkflow]);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Derived states
  const hasUploadedCode = uploadedFiles.length > 0;
  const hasPastedCode = pastedCode.trim().length > 0;
  const githubConnected = isGithubConnected;

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error('Error signing out:', err);
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
            />
          ) : (
            <div className="flex flex-1 min-w-0">
              <div className="flex-1 flex flex-col min-w-0 relative bg-white">
                <div className="h-[70px] border-b border-gray-100 flex flex-col justify-center px-6">
                  <AnimatePresence mode="wait">
                    {activeWorkflow === 'none' ? (
                      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex justify-end">
                        <button
                          onClick={handleCheckVibe}
                          disabled={!hasUploadedCode && !hasPastedCode && !selectedRepoId}
                          className={`px-8 py-2.5 rounded-full text-[13px] font-semibold transition-all duration-300 shadow-sm flex items-center gap-2 ${
                            (hasUploadedCode || hasPastedCode || selectedRepoId) 
                              ? 'bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow hover:-translate-y-0.5' 
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          Check Code Vibe
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex justify-end">
                        <button
                          onClick={handleCheckVibe}
                          disabled={!hasUploadedCode && !hasPastedCode && !selectedRepoId}
                          className={`px-8 py-2.5 rounded-full text-[13px] font-semibold transition-all duration-300 shadow-sm flex items-center gap-2 ${
                            (hasUploadedCode || hasPastedCode || selectedRepoId)
                              ? 'bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow hover:-translate-y-0.5' 
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          Check Code Vibe
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                <div className="flex-1 p-6 flex flex-col min-h-0 bg-[#faf6f4]/30">
                  {activeWorkflow === 'none' && (
                    <WorkflowSelector 
                      setActiveWorkflow={setActiveWorkflow}
                      hasUploadedCode={hasUploadedCode}
                      uploadedFilesCount={uploadedFiles.length}
                      hasPastedCode={hasPastedCode}
                      githubConnected={githubConnected}
                    />
                  )}

                  {activeWorkflow === 'upload' && (
                    <UploadWorkflow 
                      setActiveWorkflow={setActiveWorkflow}
                      uploadedFiles={uploadedFiles}
                      setUploadedFiles={setUploadedFiles}
                      setFileContents={setFileContents}
                      handleFileUpload={handleFileUpload}
                    />
                  )}

                  {activeWorkflow === 'paste' && (
                    <PasteWorkflow 
                      setActiveWorkflow={setActiveWorkflow}
                      pastedCode={pastedCode}
                      setPastedCode={setPastedCode}
                    />
                  )}

                  {activeWorkflow === 'github' && (
                    <GithubWorkflow 
                      setActiveWorkflow={setActiveWorkflow}
                      isFetchingRepos={isFetchingRepos}
                      githubReposError={githubReposError}
                      fetchGithubRepositories={fetchGithubRepositories}
                      githubSearchQuery={githubSearchQuery}
                      setGithubSearchQuery={setGithubSearchQuery}
                      githubRepos={githubRepos}
                      selectedRepoId={selectedRepoId}
                      setSelectedRepoId={setSelectedRepoId}
                      providerTokenSetupError={providerTokenSetupError}
                      retryProviderTokenSetup={retryProviderTokenSetup}
                    />
                  )}
                </div>
              </div>
              
              <AnalysisDashboard 
                isAnalyzing={isAnalyzing}
                analysisResult={analysisResult}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                expandedFinding={expandedFinding}
                setExpandedFinding={setExpandedFinding}
                filteredFindings={filteredFindings}
              />
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
