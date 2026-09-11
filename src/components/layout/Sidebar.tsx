import React from 'react';
import { CodeXml, CheckCircle2 } from 'lucide-react';
import { ReviewedItem } from '../../hooks/useAnalysis';
import { CodeVibeIcon } from '../common/CodeVibeLogo';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  reviewedItems: ReviewedItem[];
}

export function Sidebar({ activeTab, setActiveTab, reviewedItems }: SidebarProps) {
  return (
    <div className="w-[280px] bg-[#3f2a24] flex flex-col z-20 h-full">
      <div className="p-6">
        <h1 className="text-white font-bold text-[22px] tracking-tight flex items-center gap-2.5">
          <CodeVibeIcon size={24} variant="light" className="shrink-0" />
          Cody
        </h1>
      </div>
      
      <div className="flex-1 px-4 mt-6">
        <div className="text-[11px] font-semibold text-[#b8a298] uppercase tracking-wider mb-3 px-2">Menu</div>
        <div className="flex flex-col gap-1">
          <a 
            href="#" 
            onClick={(e) => { e.preventDefault(); setActiveTab('new'); }}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 mx-2 transition-colors font-medium ${
              activeTab === 'new' 
                ? 'bg-[#5b443c] text-white' 
                : 'text-white hover:bg-white/5'
            }`}
          >
            <CodeXml className="h-[18px] w-[18px] stroke-[2.5]" />
            <span>New Review</span>
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
            <span>Reviews</span>
            {reviewedItems.length > 0 && (
              <span className="ml-auto bg-white/15 text-[11px] font-medium px-2 py-0.5 rounded-full">{reviewedItems.length}</span>
            )}
          </a>
        </div>
      </div>

      {/* Free Quota Usage Card */}
      <div className="p-4 mx-4 mb-6 rounded-2xl bg-white/5 border border-white/10 text-white">
        <div className="flex items-center justify-between text-[11px] mb-2 font-medium text-[#d4c4bc]">
          <span>Free Plan</span>
          <span className="font-semibold text-white">
            {Math.max(0, 5 - reviewedItems.length)} / 5 remaining
          </span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-500 rounded-full ${
              reviewedItems.length >= 5 ? 'bg-amber-400' : 'bg-emerald-400'
            }`}
            style={{ width: `${Math.min(100, (reviewedItems.length / 5) * 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-[#b8a298] mt-2 font-normal">
          {reviewedItems.length >= 5 
            ? '0 free reviews remaining' 
            : `${5 - reviewedItems.length} free review${5 - reviewedItems.length === 1 ? '' : 's'} remaining`}
        </p>
      </div>
    </div>
  );
}
