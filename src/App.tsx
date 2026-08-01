import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, CodeXml, Github, User, X, Search, ChevronDown, BarChart2, Upload, Clipboard, Check, FileText, FolderOpen, Sparkles, Shield, Bug, Lightbulb, Gauge, Paintbrush, ChevronRight, AlertTriangle, Info, XCircle, Edit2, Lock, Trash2 } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { analyzeCode, type AnalysisResult, type Finding, type Category } from './analyzer';
import Onboarding from './Onboarding';
import { supabase } from './lib/supabase';

function getNextAvailableDate(lastUpdateStr: string | undefined, createdStr: string | undefined, months: number): Date | null {
  const baseDateStr = lastUpdateStr || createdStr;
  if (!baseDateStr) return null;
  const date = new Date(baseDateStr);
  date.setMonth(date.getMonth() + months);
  return date;
}

function isRestricted(nextDate: Date | null): boolean {
  if (!nextDate) return false;
  return new Date() < nextDate;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function App() {
  // Auth state
  const [user, setUser] = useState<{ 
    name: string; 
    email: string; 
    avatar?: string;
    created_at?: string;
    last_name_updated_at?: string;
    last_password_updated_at?: string;
  } | null>(null);

  // Listen for Supabase auth state and restore session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const meta = session.user.user_metadata;
        setUser({
          name: meta?.full_name || meta?.first_name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || '',
          avatar: meta?.avatar_url,
          created_at: session.user.created_at,
          last_name_updated_at: meta?.last_name_updated_at,
          last_password_updated_at: meta?.last_password_updated_at,
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const meta = session.user.user_metadata;
        setUser({
          name: meta?.full_name || meta?.first_name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || '',
          avatar: meta?.avatar_url,
          created_at: session.user.created_at,
          last_name_updated_at: meta?.last_name_updated_at,
          last_password_updated_at: meta?.last_password_updated_at,
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('new');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterOption, setFilterOption] = useState('Alphabetically');
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [profileNewPassword, setProfileNewPassword] = useState('');
  const [profileConfirmPassword, setProfileConfirmPassword] = useState('');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [isCurrentPasswordValid, setIsCurrentPasswordValid] = useState(false);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [isNameEditable, setIsNameEditable] = useState(false);
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [promptPassword, setPromptPassword] = useState('');
  const [promptError, setPromptError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const handleVerifyPassword = async () => {
    setProfileError('');
    if (!profileCurrentPassword) return;
    setIsVerifyingPassword(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: profileCurrentPassword,
      });
      if (error) {
        setProfileError('Incorrect current password.');
        setIsCurrentPasswordValid(false);
      } else {
        setIsCurrentPasswordValid(true);
      }
    } catch (err: any) {
      setProfileError('Failed to verify password.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const handleUnlockName = async () => {
    setPromptError('');
    if (!promptPassword) return;
    setIsUnlocking(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: promptPassword,
      });
      if (error) {
        setPromptError('Incorrect password.');
      } else {
        setIsNameEditable(true);
        setIsPasswordPromptOpen(false);
        setPromptPassword('');
      }
    } catch (err: any) {
      setPromptError('Failed to verify password.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleUpdateProfile = useCallback(async () => {
    setProfileError('');
    setProfileSuccess('');
    
    if (isCurrentPasswordValid && profileNewPassword && profileCurrentPassword) {
      if (profileNewPassword === profileCurrentPassword) {
        setProfileError('Password already used, Use different');
        return;
      }
    }

    if (profileNewPassword && profileNewPassword !== profileConfirmPassword) {
      setProfileError('Passwords do not match');
      return;
    }

    if (profileNewPassword && profileNewPassword.length < 6) {
      setProfileError('Password must be at least 6 characters');
      return;
    }

    setIsSavingProfile(true);

    try {
      const updates: any = { data: {} };
      const now = new Date().toISOString();
      if (profileName.trim() && profileName.trim() !== user?.name) {
        updates.data.full_name = profileName.trim();
        updates.data.last_name_updated_at = now;
      }
      if (profileNewPassword) {
        updates.password = profileNewPassword;
        updates.data.last_password_updated_at = now;
      }

      const { data, error } = await supabase.auth.updateUser(updates);

      if (error) throw error;

      // Send email notification via EmailJS
      try {
        const changesMade = [];
        if (profileName.trim() && profileName.trim() !== user?.name) {
          changesMade.push('Name changed to ' + profileName.trim());
        }
        if (profileNewPassword) {
          changesMade.push('Password updated');
        }

        if (changesMade.length > 0 && import.meta.env.VITE_EMAILJS_PUBLIC_KEY) {
          await emailjs.send(
            import.meta.env.VITE_EMAILJS_SERVICE_ID,
            import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
            {
              to_name: profileName.trim() || user?.name || 'User',
              to_email: user?.email,
              changes_made: changesMade.join(', ')
            },
            import.meta.env.VITE_EMAILJS_PUBLIC_KEY
          );
        } else if (changesMade.length > 0) {
          console.warn('EmailJS credentials missing in .env. Skipping email notification.');
        }
      } catch (emailErr) {
        console.error('Failed to send notification email:', emailErr);
      }

      if (profileNewPassword) {
        await supabase.auth.signOut();
        setIsProfileModalOpen(false);
        return;
      }

      setProfileSuccess('Profile updated successfully!');
      
      if (data.user) {
        const meta = data.user.user_metadata;
        setUser({
          name: meta?.full_name || meta?.first_name || data.user.email?.split('@')[0] || 'User',
          email: data.user.email || '',
          avatar: meta?.avatar_url,
          created_at: data.user.created_at,
          last_name_updated_at: meta?.last_name_updated_at,
          last_password_updated_at: meta?.last_password_updated_at,
        });
      }

      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  }, [profileName, profileNewPassword, profileConfirmPassword, isCurrentPasswordValid, profileCurrentPassword]);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);

  // Code input state
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedCode, setPastedCode] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());
  const [githubConnected, setGithubConnected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History of reviewed items
  const [reviewedItems, setReviewedItems] = useState<Array<{
    name: string;
    vibeScore: number;
    findings: number;
    date: Date;
    result: AnalysisResult;
  }>>([]);

  // Derived: which methods have code
  const hasUploadedCode = uploadedFiles.length > 0;
  const hasPastedCode = pastedCode.trim().length > 0;

  // Read file contents on upload
  const handleFileUpload = useCallback((files: File[]) => {
    setUploadedFiles(prev => [...prev, ...files]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setFileContents(prev => {
          const next = new Map(prev);
          next.set(file.name, content);
          return next;
        });
      };
      reader.readAsText(file);
    });
  }, []);

  const nextNameUpdate = getNextAvailableDate(user?.last_name_updated_at, user?.created_at, 6);
  const isNameRestricted = isRestricted(nextNameUpdate);

  const nextPasswordUpdate = user?.last_password_updated_at ? getNextAvailableDate(user.last_password_updated_at, undefined, 1) : null;
  const isPasswordRestricted = isRestricted(nextPasswordUpdate);

  // Layout calculations
  const handleCheckVibe = useCallback(async () => {
    // Gather all code
    let allCode = '';

    // Add file contents
    fileContents.forEach((content, name) => {
      allCode += `// ─── File: ${name} ───\n${content}\n\n`;
    });

    // Add pasted code
    if (pastedCode.trim()) {
      allCode += `// ─── Pasted Code ───\n${pastedCode}\n\n`;
    }

    if (!allCode.trim()) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);

    // Small delay to show the spinner
    await new Promise(resolve => setTimeout(resolve, 1200));

    const result = analyzeCode(allCode);
    setAnalysisResult(result);
    setIsAnalyzing(false);

    // Add to reviewed items
    const name = uploadedFiles.length > 0
      ? uploadedFiles.map(f => f.name).join(', ')
      : 'Pasted Code';
    setReviewedItems(prev => [{
      name: name.length > 40 ? name.slice(0, 37) + '...' : name,
      vibeScore: result.vibeScore,
      findings: result.findings.length,
      date: new Date(),
      result,
    }, ...prev]);
  }, [fileContents, pastedCode, uploadedFiles]);

  // Filter findings by category
  const filteredFindings = analysisResult?.findings.filter(
    f => activeCategory === 'all' || f.category === activeCategory
  ) || [];

  // Helper: severity icon
  const SeverityIcon = ({ severity }: { severity: Finding['severity'] }) => {
    if (severity === 'critical') return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    if (severity === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
  };

  // Helper: severity badge color
  const severityColor = (severity: Finding['severity']) => {
    if (severity === 'critical') return 'bg-red-50 text-red-700 border-red-200';
    if (severity === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  // Helper: category icon
  const CategoryIcon = ({ category }: { category: Category }) => {
    const cls = "w-3.5 h-3.5";
    if (category === 'security') return <Shield className={cls} />;
    if (category === 'quality') return <Bug className={cls} />;
    if (category === 'bestPractices') return <Lightbulb className={cls} />;
    if (category === 'performance') return <Gauge className={cls} />;
    return <Paintbrush className={cls} />;
  };

  // Helper: vibe score color
  const vibeScoreColor = (score: number) => {
    if (score >= 80) return { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200' };
    if (score >= 50) return { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50', border: 'border-amber-200' };
    return { bg: 'bg-red-500', text: 'text-red-600', light: 'bg-red-50', border: 'border-red-200' };
  };

  const categoryLabels: Record<Category, string> = {
    security: 'Security',
    quality: 'Quality',
    bestPractices: 'Best Practices',
    performance: 'Performance',
    style: 'Style',
  };

  const hasAnyCode = hasUploadedCode || hasPastedCode || githubConnected;

  // Show onboarding if not logged in
  if (!user) {
    return <Onboarding onLogin={(u) => setUser(u)} />;
  }

  return (
    <div className="flex h-screen w-full font-sans antialiased text-sm">
      {/* Sidebar */}
      <div className="w-[260px] flex-shrink-0 bg-[#3f2a24] text-white flex flex-col justify-between">
        <div>
          {/* Logo Area */}
          <div className="flex items-center gap-3 px-6 py-6 mt-1">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white">
              <path d="M7 10L3 14L7 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 10L25 14L21 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="13" cy="13" r="4" stroke="currentColor" strokeWidth="2.5"/>
              <path d="M16 16L19 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-bold text-xl tracking-wide">Code Vibe</span>
          </div>

          {/* Navigation */}
          <div className="px-4 py-2 mt-4 flex flex-col gap-1.5">
            <div className="px-3.5 mb-1 text-[12px] font-bold text-gray-400 tracking-wider">
              CODE
            </div>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); setActiveTab('new'); }}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-3 mx-2 transition-colors font-semibold ${
                activeTab === 'new' 
                  ? 'bg-[#5b443c] text-white' 
                  : 'text-white hover:bg-white/5'
              }`}
            >
              <CodeXml className="h-[18px] w-[18px] stroke-[2.5]" />
              <span>New Code</span>
            </a>
            <a 
              href="#" 
              onClick={(e) => { e.preventDefault(); setActiveTab('reviewed'); }}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-3 mx-2 transition-colors font-medium ${
                activeTab === 'reviewed' 
                  ? 'bg-[#5b443c] text-white' 
                  : 'text-white hover:bg-white/5'
              }`}
            >
              <CheckCircle2 className="h-[18px] w-[18px] stroke-[2]" />
              <span>Reviewed</span>
              {reviewedItems.length > 0 && (
                <span className="ml-auto bg-white/15 text-[11px] font-medium px-2 py-0.5 rounded-full">{reviewedItems.length}</span>
              )}
            </a>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 bg-gray-50">
        {/* Top Header */}
        <div className="h-[60px] flex items-center justify-end px-8 border-b border-gray-200 bg-white">
          <div className="relative">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-3 cursor-pointer group focus:outline-none"
            >
              <span className="text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{user.name}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 border border-gray-200 group-hover:bg-gray-200 transition-colors text-gray-600 overflow-hidden">
                {user.avatar ? (
                  <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User className="h-4 w-4" />
                )}
              </div>
            </button>
            {isProfileOpen && (
              <div className="absolute top-full right-0 mt-3 w-40 bg-white border border-gray-200 rounded-xl overflow-hidden z-20 shadow-lg flex flex-col">
                <button 
                  onClick={() => {
                    setProfileName(user.name);
                    setProfileCurrentPassword('');
                    setProfileNewPassword('');
                    setProfileConfirmPassword('');
                    setIsCurrentPasswordValid(false);
                    setIsNameEditable(false);
                    setIsPasswordPromptOpen(false);
                    setPromptPassword('');
                    setPromptError('');
                    setProfileError('');
                    setProfileSuccess('');
                    setIsProfileModalOpen(true);
                    setIsProfileOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors border-b border-gray-100"
                >
                  My Profile
                </button>
                <button 
                  onClick={async () => {
                    const { error } = await supabase.auth.signOut();
                    if (error) {
                      alert(error.message || 'Failed to log out.');
                    }
                  }}
                  className="w-full text-left px-4 py-3 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Page Content */}
        <div className="flex-1 bg-gray-50 text-gray-900">
          {activeTab === 'reviewed' ? (
            <div className="p-10 max-w-7xl mx-auto w-full">
              {/* Header Section */}
              <div className="flex items-center justify-between mb-10">
                <h1 className="text-[28px] font-semibold text-gray-900">Codes</h1>
                
                <div className="flex items-center gap-6">
                  {/* Search */}
                  <div className="relative flex items-center justify-end">
                    <div className={`flex items-center overflow-hidden rounded-full bg-white border transition-all duration-300 ${isSearchExpanded ? 'w-[320px] border-gray-300 shadow-sm' : 'w-[40px] border-transparent shadow-sm'}`}>
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
                  </div>

                  {/* Filter Pills */}
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

              {/* Table Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 text-gray-500 text-[14px]">
                <div className="flex-1">Name</div>
                <div className="w-[80px] text-center">Issues</div>
                <div className="flex items-center gap-1 cursor-pointer hover:text-gray-900 transition-colors">
                  Updated
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>

              {/* List Items */}
              <div className="flex flex-col">
                {reviewedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <BarChart2 className="w-10 h-10 mb-3" />
                    <p className="text-[14px] font-medium text-gray-500">No reviewed code yet</p>
                    <p className="text-[13px] text-gray-400 mt-1">Analyze code in the New Code tab to see results here.</p>
                  </div>
                ) : (
                  reviewedItems.map((item, i) => {
                    return (
                      <div key={i} className="flex items-center justify-between px-4 py-4 border-b border-gray-100 hover:bg-white transition-colors cursor-pointer group"
                        onClick={() => {
                          setActiveTab('new');
                          setAnalysisResult(item.result);
                          setIsAnalyzing(false);
                        }}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-[14px] font-medium text-gray-900 truncate group-hover:text-[#3f2a24] transition-colors">{item.name}</span>
                        </div>
                        <div className="w-[80px] text-center text-[13px] text-gray-500">{item.findings}</div>
                        <div className="text-[13px] text-gray-500">
                          {item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full">
              {/* Middle Screen: Add Code / Analyze */}
              <div className="flex-1 flex flex-col border-r border-gray-200 bg-gray-50 relative overflow-hidden">
                {/* Check Vibe button - top right of middle screen */}
                <div className="flex items-center justify-end px-6 py-3">
                  <button
                    onClick={handleCheckVibe}
                    disabled={!hasAnyCode || isAnalyzing}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-colors shadow-sm cursor-pointer ${
                      hasAnyCode && !isAnalyzing
                        ? 'bg-[#3f2a24] text-white hover:bg-[#5b443c]'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    Check Vibe
                  </button>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center p-10">
                  {/* Show uploaded files if any */}
                  {uploadedFiles.length > 0 && (
                    <div className="w-full max-w-md mb-8">
                      <div className="text-[13px] font-medium text-gray-500 mb-3">Uploaded Files</div>
                      <div className="flex flex-col gap-2">
                        {uploadedFiles.map((file, i) => (
                          <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-xl border border-gray-200 shadow-sm">
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-[13px] text-gray-700 truncate flex-1">{file.name}</span>
                            <span className="text-[11px] text-gray-400 flex-shrink-0">{(file.size / 1024).toFixed(1)} KB</span>
                            <button
                              onClick={() => {
                                setUploadedFiles(prev => prev.filter((_, idx) => idx !== i));
                                setFileContents(prev => {
                                  const next = new Map(prev);
                                  next.delete(file.name);
                                  return next;
                                });
                              }}
                              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-5">
                    {/* Upload Button */}
                    <button 
                      onClick={() => setIsUploadModalOpen(true)}
                      className={`w-36 h-24 flex flex-col items-center justify-center gap-2.5 rounded-2xl border shadow-sm hover:shadow-md transition-all group ${
                        hasUploadedCode
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${
                        hasUploadedCode
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-blue-50 text-blue-600'
                      }`}>
                        {hasUploadedCode ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                      </div>
                      <span className={`text-[12px] font-semibold ${hasUploadedCode ? 'text-emerald-700' : 'text-gray-700'}`}>
                        {hasUploadedCode ? `${uploadedFiles.length} file${uploadedFiles.length > 1 ? 's' : ''}` : 'Upload'}
                      </span>
                    </button>

                    {/* Paste Code Button */}
                    <button 
                      onClick={() => setIsPasteModalOpen(true)}
                      className={`w-36 h-24 flex flex-col items-center justify-center gap-2.5 rounded-2xl border shadow-sm hover:shadow-md transition-all group ${
                        hasPastedCode
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${
                        hasPastedCode
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-purple-50 text-purple-600'
                      }`}>
                        {hasPastedCode ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
                      </div>
                      <span className={`text-[12px] font-semibold ${hasPastedCode ? 'text-emerald-700' : 'text-gray-700'}`}>
                        {hasPastedCode ? 'Code Added' : 'Paste Code'}
                      </span>
                    </button>

                    {/* Github Button */}
                    <button 
                      onClick={() => setIsGithubModalOpen(true)}
                      className={`w-36 h-24 flex flex-col items-center justify-center gap-2.5 rounded-2xl border shadow-sm hover:shadow-md transition-all group ${
                        githubConnected
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${
                        githubConnected
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-gray-100 text-gray-900'
                      }`}>
                        {githubConnected ? <Check className="w-4 h-4" /> : <Github className="w-4 h-4" />}
                      </div>
                      <span className={`text-[12px] font-semibold ${githubConnected ? 'text-emerald-700' : 'text-gray-700'}`}>
                        {githubConnected ? 'Connected' : 'Github'}
                      </span>
                    </button>
                  </div>
                </div>
                
                {/* Paste Code Overlay */}
                <AnimatePresence>
                  {isPasteModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                      {/* Backdrop with blur */}
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-black/40 backdrop-blur-md"
                        onClick={() => setIsPasteModalOpen(false)}
                      />

                      {/* Modal Box */}
                      <motion.div 
                        initial={{ scale: 0.95, opacity: 0, y: 15 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 15 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="relative z-10 w-full max-w-3xl h-[75vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
                      >
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                          <button 
                            onClick={() => setIsPasteModalOpen(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                            title="Close"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <h3 className="text-[14px] font-semibold text-gray-900">Paste Code</h3>
                          <button
                            onClick={() => setIsPasteModalOpen(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#3f2a24] text-white hover:bg-[#5b443c] transition-colors shadow-sm"
                            title="Save Code"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex-1 p-0 overflow-hidden bg-white">
                          <textarea 
                            value={pastedCode}
                            onChange={(e) => setPastedCode(e.target.value)}
                            placeholder="Paste your code here..."
                            className="w-full h-full p-6 resize-none outline-none text-[13px] font-mono text-gray-800 placeholder:text-gray-400 bg-transparent leading-relaxed"
                          />
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </div>
              
              {/* Third Screen: Results */}
              <div className="w-[350px] lg:w-[400px] xl:w-[450px] bg-white flex flex-col h-full shadow-[-4px_0_24px_rgba(0,0,0,0.02)] z-10 relative">
                <div className="h-[60px] flex items-center px-6 border-b border-gray-100">
                  <h2 className="text-[15px] font-semibold text-gray-900">Analysis Results</h2>
                </div>
                <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
                  {!isAnalyzing ? (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-300 mb-4">
                        <BarChart2 className="w-8 h-8" />
                      </div>
                      <h3 className="text-[14px] font-medium text-gray-900 mb-1">No Results Yet</h3>
                      <p className="text-[13px] text-gray-500 max-w-[200px]">Add some code in the middle panel to see analysis results here.</p>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-500 mb-2">
                        <div className="w-8 h-8 border-[3px] border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                      </div>
                      <h3 className="text-[14px] font-medium text-gray-900">Processing...</h3>
                      <p className="text-[13px] text-gray-500 max-w-[200px]">Running security checks and analyzing patterns.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GitHub Sign In Modal */}
      <AnimatePresence>
        {isGithubModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsGithubModalOpen(false)}
            />

            {/* Modal Content */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-[360px] min-h-[520px] rounded-[24px] bg-[#1a1a1b] px-8 py-10 text-white shadow-2xl border border-white/10 flex flex-col items-center justify-center"
            >
              <button 
                onClick={() => setIsGithubModalOpen(false)} 
                className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <Github className="w-14 h-14 mb-10" />

              <div className="w-full flex flex-col items-center gap-4">
                <input
                  type="email"
                  className="w-[200px] focus:w-[280px] transition-all duration-300 rounded-[16px] bg-[#2a2a2b] border border-white/5 px-4 py-3.5 text-center text-[14px] font-medium text-white focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/20"
                />
                
                <button className="text-[14px] font-medium text-white mb-2 hover:text-gray-300 transition-colors">
                  Continue with email
                </button>

                <button className="flex w-[260px] items-center justify-center gap-3 rounded-full bg-white px-4 py-3 text-[14px] font-semibold text-black hover:bg-gray-100 transition-colors mt-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                    <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"/>
                    <path fill="#FBBC05" d="M5.525 18.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V10.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"/>
                    <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0 7.565 0 3.515 2.7 1.545 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
                  </svg>
                  Continue with Google
                </button>

                <button className="flex w-[260px] items-center justify-center gap-3 rounded-full bg-white px-4 py-3 text-[14px] font-semibold text-black hover:bg-gray-100 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.126 3.805 3.075 1.52-.053 2.116-.984 3.963-.984 1.838 0 2.382.973 3.96.984 1.62.01 2.66-1.488 3.64-2.923 1.127-1.65 1.591-3.245 1.619-3.328-.035-.015-3.111-1.192-3.138-4.786-.022-3.003 2.457-4.444 2.57-4.512-1.413-2.062-3.585-2.339-4.364-2.365-1.993-.082-4.004 1.294-4.646 1.294v-.004zm1.503-4.536c.824-.997 1.38-2.386 1.229-3.76-.14.006-.312.02-.497.054-1.393.256-2.81 1.124-3.663 2.15-.658.784-1.3 2.115-1.11 3.492 1.506.115 2.873-.787 3.73-1.84h.011z"/>
                  </svg>
                  Continue with Apple
                </button>

                <button className="mt-4 text-[13px] font-medium text-[#777] hover:text-white transition-colors">
                  Already Have an Account ?
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upload File Modal */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsUploadModalOpen(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-[440px] bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-2">
                <div>
                  <h3 className="text-[16px] font-semibold text-gray-900">Upload Files</h3>
                  <p className="text-[12px] text-gray-400 mt-0.5">Add code files for vibe check</p>
                </div>
                <button
                  onClick={() => setIsUploadModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drop zone */}
              <div className="px-6 py-5">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#d4c4bc] rounded-2xl p-10 flex flex-col items-center justify-center gap-4 bg-[#faf6f4] hover:bg-[#f5eeea] hover:border-[#b8a298] transition-all cursor-pointer group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-[#3f2a24] flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-medium text-gray-800">Click to browse files</p>
                    <p className="text-[12px] text-gray-400 mt-1">Supports .js, .ts, .py, .java, .go, .rs and more</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.html,.css,.json,.xml,.yaml,.yml,.md,.txt,.sql,.sh,.bat,.swift,.kt,.dart,.vue,.svelte,.r,.scala,.lua,.pl,.m,.h,.hpp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileUpload(Array.from(e.target.files));
                      setIsUploadModalOpen(false);
                    }
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-5 py-2 rounded-xl text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-2 rounded-xl text-[13px] font-semibold text-white bg-[#3f2a24] hover:bg-[#5b443c] transition-colors flex items-center gap-2 shadow-sm"
                >
                  <FolderOpen className="w-4 h-4" />
                  File
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsProfileModalOpen(false)}
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-[440px] bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
                <h3 className="text-[16px] font-semibold text-gray-900">My Profile</h3>
                <button
                  onClick={() => setIsProfileModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 flex flex-col gap-4">
                {profileSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 text-[13px] font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {profileSuccess}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-semibold text-gray-700">Email Address (Read Only)</label>
                  <input
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] text-gray-500 cursor-not-allowed outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-semibold text-gray-700">Full Name</label>
                    {isNameRestricted ? (
                      <span className="text-[11px] font-medium text-gray-400 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Available {nextNameUpdate ? formatDate(nextNameUpdate) : ''}
                      </span>
                    ) : !isNameEditable && (
                      <button
                        onClick={() => setIsPasswordPromptOpen(true)}
                        className="text-[12px] font-medium text-[#3f2a24] hover:text-[#2c1d19] transition-colors flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Your Name"
                    disabled={!isNameEditable}
                    className={`w-full border rounded-xl px-4 py-2.5 text-[14px] text-gray-900 outline-none transition-colors ${!isNameEditable ? 'bg-gray-50 border-gray-100 cursor-not-allowed opacity-80' : 'bg-white border-gray-200 focus:border-[#3f2a24]'}`}
                  />
                </div>

                <div className="h-px w-full bg-gray-100 my-2" />
                
                <div className="text-[14px] font-semibold text-gray-900 mb-1">Change Password</div>

                {isPasswordRestricted ? (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                    <Lock className="w-4 h-4 text-gray-400" />
                    <span className="text-[12px] font-medium text-gray-500">
                      Password can be changed again on {nextPasswordUpdate ? formatDate(nextPasswordUpdate) : ''}
                    </span>
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    {!isCurrentPasswordValid ? (
                      <motion.div
                        key="verify"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="flex flex-col gap-1.5"
                      >
                        <label className="text-[12px] font-semibold text-gray-700">Current Password</label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={profileCurrentPassword}
                            onChange={(e) => {
                              setProfileCurrentPassword(e.target.value);
                              setProfileError('');
                            }}
                            placeholder="Enter current password to change"
                            className="flex-1 bg-white border border-gray-200 focus:border-[#3f2a24] rounded-xl px-4 py-2.5 text-[14px] text-gray-900 outline-none transition-colors"
                          />
                          <button
                            onClick={handleVerifyPassword}
                            disabled={isVerifyingPassword || !profileCurrentPassword}
                            className="px-4 py-1 h-[36px] self-center rounded-full text-[12px] font-semibold text-white bg-[#3f2a24] hover:bg-[#2c1d19] transition-colors disabled:opacity-50 shrink-0"
                          >
                            {isVerifyingPassword ? '...' : 'Confirm'}
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="new-password"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="flex flex-col gap-4 p-4 bg-gray-50 border border-gray-200 rounded-xl"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold text-emerald-600 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" /> Current password verified
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[12px] font-semibold text-gray-700">New Password</label>
                          <input
                            type="password"
                            value={profileNewPassword}
                            onChange={(e) => setProfileNewPassword(e.target.value)}
                            placeholder="New password"
                            className="w-full bg-white border border-gray-200 focus:border-[#3f2a24] rounded-xl px-4 py-2.5 text-[14px] text-gray-900 outline-none transition-colors"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[12px] font-semibold text-gray-700">Confirm New Password</label>
                          <input
                            type="password"
                            value={profileConfirmPassword}
                            onChange={(e) => setProfileConfirmPassword(e.target.value)}
                            placeholder="Confirm new password"
                            className="w-full bg-white border border-gray-200 focus:border-[#3f2a24] rounded-xl px-4 py-2.5 text-[14px] text-gray-900 outline-none transition-colors"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}

                <AnimatePresence>
                  {profileError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-medium">
                        {profileError}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <AnimatePresence>
                {isPasswordPromptOpen && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-white/95 backdrop-blur-sm rounded-2xl">
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                      className="w-full bg-white rounded-xl shadow-xl border border-gray-100 p-5 flex flex-col gap-3"
                    >
                      <h4 className="text-[14px] font-semibold text-gray-900">Unlock Editing</h4>
                      <p className="text-[12px] text-gray-500">Please enter your current password to edit your profile details.</p>
                      
                      <div className="flex flex-col gap-1 mt-1">
                        <input
                          type="password"
                          value={promptPassword}
                          onChange={(e) => { setPromptPassword(e.target.value); setPromptError(''); }}
                          onKeyDown={(e) => e.key === 'Enter' && handleUnlockName()}
                          placeholder="Current password"
                          className="w-full bg-white border border-gray-200 focus:border-[#3f2a24] rounded-lg px-3 py-2 text-[13px] text-gray-900 outline-none"
                        />
                        {promptError && <span className="text-[11px] text-red-500 font-medium ml-1">{promptError}</span>}
                      </div>

                      <div className="flex items-center justify-end gap-2 mt-2">
                        <button
                          onClick={() => { setIsPasswordPromptOpen(false); setPromptPassword(''); setPromptError(''); }}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleUnlockName}
                          disabled={isUnlocking || !promptPassword}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-[#3f2a24] hover:bg-[#2c1d19] transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {isUnlocking ? 'Unlocking...' : 'Unlock'}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 relative z-10 flex flex-col gap-3">
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setIsProfileModalOpen(false)}
                    className="px-5 py-2 rounded-xl text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleUpdateProfile}
                    disabled={isSavingProfile}
                    className="px-6 py-2 rounded-xl text-[13px] font-semibold text-white bg-[#3f2a24] hover:bg-[#5b443c] transition-colors flex items-center gap-2 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSavingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
                <div className="h-px w-full bg-gray-200" />
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(true);
                    setIsProfileModalOpen(false);
                    setDeleteConfirmText('');
                    setDeleteError('');
                  }}
                  className="self-start text-[12px] font-medium text-red-400 hover:text-red-600 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" /> Delete Account
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Account Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => !isDeletingAccount && setIsDeleteModalOpen(false)}
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative z-10 w-full max-w-[420px] bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-red-100">
                <h3 className="text-[16px] font-semibold text-red-700 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Delete Account
                </h3>
                <button
                  onClick={() => !isDeletingAccount && setIsDeleteModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 flex flex-col gap-4">
                <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-[13px] font-semibold text-red-700 mb-1">⚠️ This action is permanent and cannot be undone.</p>
                  <p className="text-[12px] text-red-600 leading-relaxed">
                    All your data will be permanently deleted, including your profile, saved reviews, repositories, pull request history, and settings.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-semibold text-gray-700">
                    Type <span className="font-bold text-red-600">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => { setDeleteConfirmText(e.target.value); setDeleteError(''); }}
                    placeholder="Type DELETE here"
                    disabled={isDeletingAccount}
                    className="w-full bg-white border border-gray-200 focus:border-red-400 rounded-xl px-4 py-2.5 text-[14px] text-gray-900 outline-none transition-colors"
                  />
                </div>

                <AnimatePresence>
                  {deleteError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-medium">
                        {deleteError}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeletingAccount}
                  className="px-5 py-2 rounded-xl text-[13px] font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (deleteConfirmText !== 'DELETE') {
                      setDeleteError('Please type DELETE exactly to confirm.');
                      return;
                    }

                    setIsDeletingAccount(true);
                    setDeleteError('');

                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session?.user) {
                        setDeleteError('No active session. Please sign in again.');
                        return;
                      }

                      const userId = session.user.id;

                      // Delete all user-owned data from database tables
                      const tablesToClear = ['profiles', 'reviews', 'repositories', 'pull_requests', 'settings'];
                      for (const table of tablesToClear) {
                        const { error: tableError } = await supabase
                          .from(table)
                          .delete()
                          .eq('user_id', userId);
                        
                        // Ignore "relation does not exist" errors (table may not exist yet)
                        if (tableError && !tableError.message?.includes('does not exist') && !tableError.message?.includes('relation')) {
                          throw new Error(`Failed to delete data from ${table}: ${tableError.message}`);
                        }
                      }

                      // Also try deleting from profiles where id = userId (profiles use id, not user_id)
                      const { error: profileError } = await supabase
                        .from('profiles')
                        .delete()
                        .eq('id', userId);
                      
                      if (profileError && !profileError.message?.includes('does not exist') && !profileError.message?.includes('relation')) {
                        throw new Error('Failed to delete profile: ' + profileError.message);
                      }

                      // Sign out and clear session
                      await supabase.auth.signOut();
                      setUser(null);
                      setIsDeleteModalOpen(false);

                    } catch (err: any) {
                      setDeleteError(err.message || 'An error occurred while deleting your account.');
                    } finally {
                      setIsDeletingAccount(false);
                    }
                  }}
                  disabled={isDeletingAccount || deleteConfirmText !== 'DELETE'}
                  className="px-6 py-2 rounded-xl text-[13px] font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeletingAccount ? 'Deleting...' : 'Delete My Account'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
