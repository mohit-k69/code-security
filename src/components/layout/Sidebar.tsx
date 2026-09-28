import React from 'react';
import { CodeXml, CheckCircle2, X } from 'lucide-react';
import { ReviewedItem } from '../../hooks/useAnalysis';
import { CodeVibeIcon } from '../common/CodeVibeLogo';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  reviewedItems: ReviewedItem[];
  onClose?: () => void;
}

export function Sidebar({ activeTab, setActiveTab, reviewedItems, onClose }: SidebarProps) {
  return (
    <div className="w-[225px] bg-[#3f2a24] flex flex-col z-20 h-full">
      <div className="px-4 py-4 flex items-center justify-between">
        <h1 className="text-white font-bold text-[20px] tracking-tight flex items-center gap-2">
          <CodeVibeIcon size={20} variant="light" className="shrink-0" />
          Cody
        </h1>
        {onClose && (
          <button 
            type="button"
            onClick={onClose}
            className="md:hidden p-1 -mr-1 rounded-lg text-[#b8a298] hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      
      <div className="flex-1 px-3 mt-3">
        <div className="text-[10.5px] font-semibold text-[#b8a298] uppercase tracking-wider mb-2 px-2.5">Menu</div>
        <div className="flex flex-col gap-1">
          <a 
            href="#" 
            onClick={(e) => { e.preventDefault(); setActiveTab('new'); }}
            className={`flex items-center gap-2.5 rounded-lg px-3.5 h-10 transition-colors font-medium text-[14px] ${
              activeTab === 'new' 
                ? 'bg-[#5b443c] text-white' 
                : 'text-white hover:bg-white/5'
            }`}
          >
            <CodeXml className="h-[17.5px] w-[17.5px] stroke-[2.2] shrink-0" />
            <span>New Review</span>
          </a>
          <a 
            href="#" 
            onClick={(e) => { e.preventDefault(); setActiveTab('reviewed'); }}
            className={`flex items-center gap-2.5 rounded-lg px-3.5 h-10 transition-colors font-medium text-[14px] ${
              activeTab === 'reviewed' 
                ? 'bg-[#5b443c] text-white' 
                : 'text-white hover:bg-white/5'
            }`}
          >
            <CheckCircle2 className="h-[17.5px] w-[17.5px] stroke-[2] shrink-0" />
            <span>Reviews</span>
            {reviewedItems.length > 0 && (
              <span className="ml-auto bg-white/15 text-[11px] font-medium h-[18px] min-w-[18px] px-1.5 rounded-full flex items-center justify-center">{reviewedItems.length}</span>
            )}
          </a>
        </div>
      </div>

      {/* Free Quota Usage Card */}
      <div className="p-3 mx-3 mb-4 rounded-xl bg-white/5 border border-white/10 text-white">
        <div className="flex items-center justify-between text-[11px] mb-1.5 font-medium text-[#d4c4bc]">
          <span>Free Plan</span>
          <span className="font-semibold text-white">
            {Math.max(0, 5 - reviewedItems.length)} / 5 remaining
          </span>
        </div>
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 rounded-full ${
              reviewedItems.length >= 5 ? 'bg-amber-400' : 'bg-emerald-400'
            }`}
            style={{ width: `${Math.min(100, (reviewedItems.length / 5) * 100)}%` }}
          />
        </div>
        <p className="text-[10.5px] text-[#b8a298] mt-1.5 font-normal">
          {reviewedItems.length >= 5 
            ? '0 free reviews remaining' 
            : `${5 - reviewedItems.length} free review${5 - reviewedItems.length === 1 ? '' : 's'} remaining`}
        </p>
      </div>
    </div>
  );
}
