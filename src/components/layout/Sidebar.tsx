import React from 'react';
import { CodeXml, CheckCircle2 } from 'lucide-react';
import { ReviewedItem } from '../../hooks/useAnalysis';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  reviewedItems: ReviewedItem[];
}

export function Sidebar({ activeTab, setActiveTab, reviewedItems }: SidebarProps) {
  return (
    <div className="w-[280px] bg-[#3f2a24] flex flex-col z-20 h-full">
      <div className="p-6">
        <h1 className="text-white font-bold text-[22px] tracking-tight flex items-center gap-2">
          <CodeXml className="h-6 w-6 text-[#d4c4bc]" />
          Code Vibe
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
    </div>
  );
}
