import React from 'react';
import { Search, ChevronDown, FileText, ChevronRight } from 'lucide-react';

interface ReviewedItem {
  name: string;
  verdict: 'PASS' | 'FAIL' | 'NOT_VERIFIED' | string;
  pr: number | null;
  date: Date;
  result: any;
}

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

export function HistoryView({
  reviewedItems,
  isSearchExpanded,
  setIsSearchExpanded,
  isFilterOpen,
  setIsFilterOpen,
  filterOption,
  setFilterOption,
  setActiveTab,
  setAnalysisResult
}: HistoryViewProps) {
  return (
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
        <div className="w-[120px] text-center">Verdict</div>
        <div className="w-[120px] text-center">PR</div>
        <div className="w-[150px] text-right">Date</div>
        <div className="w-[60px]"></div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {reviewedItems
            .filter(item => Date.now() - item.date.getTime() <= 30 * 24 * 60 * 60 * 1000)
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .map((item, i) => (
            <div 
              key={i} 
              onClick={() => setAnalysisResult(item.result)}
              className="flex items-center justify-between px-4 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors group cursor-pointer"
            >
              <div className="flex-1 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:shadow-sm transition-all">
                  <FileText className="w-4 h-4" />
                </div>
                <span className="text-[14px] font-medium text-gray-900 truncate pr-4">{item.name}</span>
              </div>
              
              <div className="w-[120px] flex justify-center">
                <span className={`px-2.5 py-1 rounded-md text-[12px] font-bold ${
                  item.verdict === 'FAIL' ? 'bg-red-100 text-red-700' :
                  item.verdict === 'NOT_VERIFIED' ? 'bg-orange-100 text-orange-700' :
                  'bg-emerald-100 text-emerald-700'
                }`}>
                  {item.verdict === 'NOT_VERIFIED' ? 'NOT VERIFIED' : item.verdict || 'PASS'}
                </span>
              </div>
              
              <div className="w-[120px] flex justify-center">
                <span className="text-[13px] text-gray-600 font-medium">
                  {item.pr ? `PR #${item.pr}` : '—'}
                </span>
              </div>
              
              <div className="w-[150px] text-right">
                <span className="text-[13px] text-gray-500">
                  {item.date.toLocaleString(undefined, { 
                    month: 'short', 
                    day: 'numeric', 
                    hour: 'numeric', 
                    minute: '2-digit'
                  })}
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
  );
}
