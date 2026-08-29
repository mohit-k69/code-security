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
    handleGithubAnalysisComplete,
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

                <div className="flex-1 p-6 flex flex-col min-h-0 bg-[#faf6f4]/30">
                  {activeWorkflow === 'none' && (
                    <WorkflowSelector 
                      setActiveWorkflow={setActiveWorkflow}
                      hasUploadedCode={hasUploadedCode}
                      uploadedFilesCount={uploadedFiles.length}
                      hasPastedCode={hasPastedCode}
                      githubConnected={githubConnected}
                      onAnalyze={async () => {
                        await handleCheckVibe();
                      }}
                      onLoadSampleAndAnalyze={async () => {
                        setPastedCode(`// Sample Authentication & Payment Service
import express from 'express';

const app = express();
const API_SECRET_KEY = "sk_live_99a82b4f912e41c88ab9134"; // Hardcoded secret

app.post('/api/user/eval', (req, res) => {
  const { code } = req.body;
  // Critical vulnerability: arbitrary code execution
  const result = eval(code);
  res.json({ result });
});

app.post('/api/profile/render', (req, res) => {
  const { bio } = req.body;
  // Critical vulnerability: XSS injection via innerHTML
  document.getElementById('user-bio').innerHTML = bio;
});

export default app;`);
                        await handleCheckVibe();
                      }}
                    />
                  )}

                  {activeWorkflow === 'upload' && (
                    <UploadWorkflow 
                      setActiveWorkflow={setActiveWorkflow}
                      uploadedFiles={uploadedFiles}
                      setUploadedFiles={setUploadedFiles}
                      setFileContents={setFileContents}
                      handleFileUpload={handleFileUpload}
                      handleCheckVibe={async () => { await handleCheckVibe(); setActiveWorkflow('none'); }}
                    />
                  )}

                  {activeWorkflow === 'paste' && (
                    <PasteWorkflow 
                      setActiveWorkflow={setActiveWorkflow}
                      pastedCode={pastedCode}
                      setPastedCode={setPastedCode}
                      handleCheckVibe={async () => { await handleCheckVibe(); setActiveWorkflow('none'); }}
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
                      onAnalysisComplete={handleGithubAnalysisComplete}
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
