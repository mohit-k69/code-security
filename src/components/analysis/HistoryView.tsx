import React, { useState, useEffect } from 'react';
import { Search, ChevronDown, FileText, ChevronRight, AlertTriangle, ArrowLeft, X } from 'lucide-react';
import type { ReviewedItem } from '../../lib/reviewsService';
import { HistoricalReportView } from './HistoricalReportView';

interface HistoryViewProps {
  reviewedItems: ReviewedItem[];
  isSearchExpanded: boolean;
  setIsSearchExpanded: (expanded: boolean) => void;
  isFilterOpen: boolean;
  setIsFilterOpen: (open: boolean) => void;
  filterOption: string;
  setFilterOption: (option: string) => void;
  setActiveTab: (tab: string) => void;
  setAnalysisResult: (result: any) => void;
}

function formatReviewDate(date: Date): string {
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const time = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${month} ${day} at ${time}`;
}

export function HistoryView({
  reviewedItems,
  isSearchExpanded,
  setIsSearchExpanded,
  isFilterOpen,
  setIsFilterOpen,
  filterOption,
  setFilterOption,
  setActiveTab,
  setAnalysisResult: _setAnalysisResult
}: HistoryViewProps) {
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('reviewId') || null;
    }
    return null;
  });

  const [cachedReview, setCachedReview] = useState<ReviewedItem | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('cody_active_historical_review');
        if (stored) return JSON.parse(stored);
      } catch {
        // Safe fallback
      }
    }
    return null;
  });

  const [searchQuery, setSearchQuery] = useState('');

  // Synchronize browser history / popstate
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedReviewId(params.get('reviewId') || null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectReview = (item: ReviewedItem | null) => {
    if (item) {
      const id = item.id || item.name;
      setSelectedReviewId(id);
      setCachedReview(item);
      try {
        sessionStorage.setItem('cody_active_historical_review', JSON.stringify(item));
      } catch {
        // Safe fallback
      }
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'reviewed');
      url.searchParams.set('reviewId', id);
      window.history.pushState({ reviewId: id }, '', url.toString());
    } else {
      setSelectedReviewId(null);
      setCachedReview(null);
      try {
        sessionStorage.removeItem('cody_active_historical_review');
      } catch {
        // Safe fallback
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('reviewId');
      window.history.pushState({}, '', url.toString());
    }
  };

  // If a historical review is currently selected, render the dedicated report view
  if (selectedReviewId) {
    const activeReview = 
      reviewedItems.find(item => (item.id && item.id === selectedReviewId) || item.name === selectedReviewId) ||
      (cachedReview && ((cachedReview.id && cachedReview.id === selectedReviewId) || cachedReview.name === selectedReviewId) ? cachedReview : null);

    if (activeReview) {
      return (
        <HistoricalReportView
          key={activeReview.id || activeReview.name}
          review={activeReview}
          onBack={() => handleSelectReview(null)}
        />
      );
    }

    // Historical review was not found (or failed to load) - show clear error state, NOT PASS
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Unable to load this review.</h3>
        <p className="text-gray-500 text-sm max-w-md mb-6">
          The requested historical review could not be found or has expired.
        </p>
        <button
          onClick={() => handleSelectReview(null)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reviews
        </button>
      </div>
    );
  }

  // Filter and sort items
  const filteredItems = reviewedItems
    .filter(item => {
      const itemDate = item.date instanceof Date ? item.date : new Date(item.date || Date.now());
      return Date.now() - itemDate.getTime() <= 30 * 24 * 60 * 60 * 1000;
    })
    .filter(item => {
      if (!searchQuery.trim()) return true;
      return item.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    })
    .sort((a, b) => {
      if (filterOption === 'Alphabetically') return a.name.localeCompare(b.name);
      const aTime = a.date instanceof Date ? a.date.getTime() : new Date(a.date || 0).getTime();
      const bTime = b.date instanceof Date ? b.date.getTime() : new Date(b.date || 0).getTime();
      return bTime - aTime;
    });

  // Standard Reviews list view
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white">
      {/* Header with Title and Search/Filter Controls */}
      <div className="px-4 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <div>
          <h2 className="text-[18px] sm:text-[20px] font-semibold text-gray-900 tracking-tight">Previous Reviews</h2>
          <p className="text-[13px] sm:text-[14px] text-gray-500 mt-0.5 md:mt-1">View history of your code analysis.</p>
        </div>
        
        <div className="flex items-center gap-2.5 sm:gap-4 w-full md:w-auto">
          {/* Search bar */}
          <div className={`flex items-center bg-gray-50 border border-gray-200 rounded-full transition-all duration-300 overflow-hidden ${
            isSearchExpanded 
              ? 'flex-1 md:flex-initial md:w-[280px]' 
              : 'w-[38px] sm:w-[40px]'
          } h-[38px] sm:h-[40px]`}>
            <button 
              id="search-reviews-btn"
              onClick={() => setIsSearchExpanded(true)}
              className="w-[38px] sm:w-[40px] h-[38px] sm:h-[40px] shrink-0 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors focus:outline-none cursor-pointer"
              title="Search reviews"
              aria-label="Search reviews"
            >
              <Search className="w-4 h-4" />
            </button>
            <input 
              id="search-reviews-input"
              type="text"
              placeholder="Search reviews..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full bg-transparent pr-2 py-1.5 text-[13px] sm:text-[14px] text-gray-900 placeholder:text-gray-500 outline-none min-w-0 ${isSearchExpanded ? 'opacity-100' : 'opacity-0'}`}
              onBlur={(e) => {
                if (e.target.value === '') {
                  setIsSearchExpanded(false);
                }
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="pr-3 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                title="Clear search"
                aria-label="Clear search input"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Dropdown */}
          <div className="relative shrink-0">
            <button 
              id="filter-dropdown-btn"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 h-[38px] sm:h-[40px] rounded-full bg-white text-gray-900 text-[12px] sm:text-[13px] font-medium hover:bg-gray-50 transition-colors border border-gray-200 shadow-xs focus:outline-none cursor-pointer whitespace-nowrap"
            >
              <span>{filterOption}</span>
              <ChevronDown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 transition-transform duration-200 ${isFilterOpen ? 'rotate-180' : ''}`} />
            </button>
            {isFilterOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-36 sm:w-40 bg-white border border-gray-200 rounded-xl overflow-hidden z-20 shadow-lg">
                <button 
                  onClick={() => { setFilterOption('Alphabetically'); setIsFilterOpen(false); }}
                  className="w-full text-left px-3.5 py-2 text-[12px] sm:text-[13px] text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Alphabetically
                </button>
                <button 
                  onClick={() => { setFilterOption('By date'); setIsFilterOpen(false); }}
                  className="w-full text-left px-3.5 py-2 text-[12px] sm:text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors cursor-pointer"
                >
                  By date
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Table Header (hidden on mobile) */}
      <div className="hidden md:flex items-center justify-between px-4 py-3 border-b border-gray-200 text-gray-500 text-[14px]">
        <div className="flex-1">Name</div>
        <div className="w-[120px] text-center">Verdict</div>
        <div className="w-[120px] text-center">PR</div>
        <div className="w-[150px] text-right">Date</div>
        <div className="w-[60px]"></div>
      </div>
      
      {/* Reviews List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col">
          {filteredItems.map((item, i) => {
            const itemDate = item.date instanceof Date ? item.date : new Date(item.date || Date.now());
            const formattedDate = formatReviewDate(itemDate);
            const isPaste = item.reviewType === 'paste' || item.result?.reviewType === 'paste' || item.result?.repository?.name === 'paste_snippet';
            const count = (
              (item.result?.totalFindings ?? 0) > 0 ||
              (Array.isArray(item.result?.findings) && item.result.findings.length > 0)
            ) ? 1 : 0;
            const displayVerdict = isPaste
              ? (item.verdict === 'FAIL' || count > 0 ? 'FAIL' : 'PASS')
              : (item.verdict === 'NOT_VERIFIED' ? 'NOT VERIFIED' : item.verdict || 'PASS');

            const prDisplay = item.pr ? `PR #${item.pr}` : 'PR —';
            const desktopPrDisplay = item.pr ? `PR #${item.pr}` : '—';

            return (
              <React.Fragment key={item.id || `${item.name}-${i}`}>
                {/* ─── Mobile Review Item (md:hidden) ─── */}
                <div 
                  onClick={() => handleSelectReview(item)}
                  className="md:hidden flex items-center justify-between px-4 py-3.5 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100/70 transition-colors group cursor-pointer gap-3 w-full"
                >
                  {/* Left: Document Icon */}
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:shadow-xs transition-all shrink-0 self-start mt-0.5">
                    <FileText className="w-4 h-4" />
                  </div>

                  {/* Middle Content Hierarchy */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    {/* Primary: Repository Name */}
                    <span 
                      className="text-[14px] font-semibold text-gray-900 truncate leading-snug"
                      title={item.name}
                    >
                      {item.name}
                    </span>

                    {/* Secondary: Verdict Badge */}
                    <div className="flex items-center pt-0.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold tracking-wide ${
                        displayVerdict === 'FAIL' ? 'bg-red-100 text-red-700' :
                        displayVerdict === 'NOT_VERIFIED' ? 'bg-orange-100 text-orange-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {displayVerdict}
                      </span>
                    </div>

                    {/* Tertiary: PR + Date/Time (Single compact line, no awkward wraps) */}
                    <div className="flex items-center gap-1.5 text-[12px] text-gray-500 whitespace-nowrap overflow-hidden pt-0.5 leading-tight">
                      <span className="font-medium text-gray-600 shrink-0">
                        {prDisplay}
                      </span>
                      <span className="text-gray-300 shrink-0">·</span>
                      <span className="text-gray-500 shrink-0">
                        {formattedDate}
                      </span>
                    </div>
                  </div>

                  {/* Right: Chevron */}
                  <div className="shrink-0 flex items-center justify-center pl-1 text-gray-300">
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                  </div>
                </div>

                {/* ─── Desktop Table Row (hidden md:flex) ─── */}
                <div 
                  onClick={() => handleSelectReview(item)}
                  className="hidden md:flex items-center justify-between px-4 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors group cursor-pointer"
                >
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:shadow-sm transition-all shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <span className="text-[14px] font-medium text-gray-900 truncate pr-4">{item.name}</span>
                  </div>
                  
                  <div className="w-[120px] flex justify-center shrink-0">
                    <span className={`px-2.5 py-1 rounded-md text-[12px] font-bold ${
                      displayVerdict === 'FAIL' ? 'bg-red-100 text-red-700' :
                      displayVerdict === 'NOT_VERIFIED' ? 'bg-orange-100 text-orange-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {displayVerdict}
                    </span>
                  </div>
                  
                  <div className="w-[120px] flex justify-center shrink-0">
                    <span className="text-[13px] text-gray-600 font-medium">
                      {desktopPrDisplay}
                    </span>
                  </div>
                  
                  <div className="w-[150px] text-right shrink-0">
                    <span className="text-[13px] text-gray-500">
                      {itemDate.toLocaleString(undefined, { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: 'numeric', 
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  
                  <div className="w-[60px] flex justify-end shrink-0">
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-600 transition-colors" />
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-gray-500 px-4 text-center">
              <FileText className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-[14px] font-medium text-gray-700">
                {searchQuery ? 'No reviews match your search.' : 'No reviews yet.'}
              </p>
              {searchQuery ? (
                <button 
                  onClick={() => { setSearchQuery(''); setIsSearchExpanded(false); }}
                  className="mt-3 px-4 py-2 bg-white border border-gray-200 rounded-lg text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Clear Search
                </button>
              ) : (
                <button 
                  onClick={() => setActiveTab('new')}
                  className="mt-4 px-4 py-2 bg-white border border-gray-200 rounded-lg text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Start a Review
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

