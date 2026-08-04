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
            <div className="flex-1 flex flex-col min-w-0 bg-white">
              {/* Reviewed items layout */}
              <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-[20px] font-semibold text-gray-900 tracking-tight">Previous Reviews</h2>
                  <p className="text-[14px] text-gray-500 mt-1">View history of your code analysis.</p>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className={`flex items-center bg-gray-50 border border-gray-200 rounded-full transition-all duration-300 overflow-hidden ${isSearchExpanded ? 'w-[280px]' : 'w-[40px]'}`}>
                    <button 
                      onClick={() => setIsSearchExpanded(true)}
                      className="w-[40px] h-[40px] flex-shrink-0 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors focus:outline-none"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                    <input 
                      type="text"
                      placeholder="Search by description or filename"
                      className={`w-full bg-transparent pr-4 py-2 text-[14px] text-gray-900 placeholder:text-gray-500 outline-none ${isSearchExpanded ? 'opacity-100' : 'opacity-0'}`}
                      onBlur={(e) => {
                        if (e.target.value === '') {
                          setIsSearchExpanded(false);
                        }
                      }}
                    />
                  </div>

                  <div className="relative">
                    <button 
                      onClick={() => setIsFilterOpen(!isFilterOpen)}
                      className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-gray-900 text-[13px] font-medium hover:bg-gray-50 transition-colors border border-gray-200 shadow-sm focus:outline-none"
                    >
                      {filterOption}
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isFilterOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isFilterOpen && (
                      <div className="absolute top-full right-0 mt-2 w-40 bg-white border border-gray-200 rounded-xl overflow-hidden z-10 shadow-lg">
                        <button 
                          onClick={() => { setFilterOption('Alphabetically'); setIsFilterOpen(false); }}
                          className="w-full text-left px-4 py-2 text-[13px] text-gray-900 hover:bg-gray-50 transition-colors"
                        >
                          Alphabetically
                        </button>
                        <button 
                          onClick={() => { setFilterOption('By date'); setIsFilterOpen(false); }}
                          className="w-full text-left px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                        >
                          By date
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 text-gray-500 text-[14px]">
                <div className="flex-1">Name</div>
                <div className="w-[120px] text-center">Score</div>
                <div className="w-[120px] text-center">Findings</div>
                <div className="w-[150px] text-right">Date</div>
                <div className="w-[60px]"></div>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                <div className="flex flex-col">
                  {reviewedItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors group cursor-pointer">
                      <div className="flex-1 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:shadow-sm transition-all">
                          <FileText className="w-4 h-4" />
                        </div>
                        <span className="text-[14px] font-medium text-gray-900">{item.name}</span>
                      </div>
                      
                      <div className="w-[120px] flex justify-center">
                        <span className={`px-2.5 py-1 rounded-md text-[12px] font-bold ${
                          item.vibeScore >= 90 ? 'bg-emerald-100 text-emerald-700' :
                          item.vibeScore >= 70 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {item.vibeScore}
                        </span>
                      </div>
                      
                      <div className="w-[120px] flex justify-center">
                        <span className="text-[13px] text-gray-600 font-medium">
                          {item.findings}
                        </span>
                      </div>
                      
                      <div className="w-[150px] text-right">
                        <span className="text-[13px] text-gray-500">
                          {item.date.toLocaleDateString()}
                        </span>
                      </div>
                      
                      <div className="w-[60px] flex justify-end">
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-600 transition-colors" />
                      </div>
                    </div>
                  ))}
                  {reviewedItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                      <FileText className="w-12 h-12 text-gray-300 mb-4" />
                      <p className="text-[14px]">No reviews yet.</p>
                      <button 
                        onClick={() => setActiveTab('new')}
                        className="mt-4 px-4 py-2 bg-white border border-gray-200 rounded-lg text-[13px] font-medium hover:bg-gray-50 transition-colors"
                      >
                        Start a Review
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
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
