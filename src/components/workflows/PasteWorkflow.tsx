import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Loader2 } from 'lucide-react';

interface PasteWorkflowProps {
  setActiveWorkflow: (workflow: 'none') => void;
  pastedCode: string;
  setPastedCode: (code: string) => void;
  handleCheckVibe: () => void;
  isAnalyzing: boolean;
  isLimitReached?: boolean;
}

export function PasteWorkflow({ 
  setActiveWorkflow, 
  pastedCode, 
  setPastedCode, 
  handleCheckVibe, 
  isAnalyzing,
  isLimitReached = false
}: PasteWorkflowProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col h-full min-h-0 max-w-full mx-auto w-full"
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <button 
            id="paste-code-back-btn"
            type="button"
            onClick={() => setActiveWorkflow('none')} 
            className="p-1.5 sm:p-2 rounded-xl hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer -ml-1"
            aria-label="Back to home"
            title="Back to home"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-[17px] sm:text-[18px] font-semibold text-gray-900">Paste Code</h2>
        </div>
        <button
          id="paste-code-analyze-btn"
          type="button"
          onClick={handleCheckVibe}
          disabled={!pastedCode.trim() || isAnalyzing || isLimitReached}
          title={isLimitReached ? 'Free review limit reached' : undefined}
          className={`flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-[13px] font-semibold transition-all shadow-xs shrink-0 ${
            pastedCode.trim() && !isAnalyzing && !isLimitReached
              ? 'bg-[#3f2a24] text-white hover:bg-[#2c1d19] active:bg-[#1a110e] hover:shadow-md cursor-pointer hover:-translate-y-0.5'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing...</span>
            </>
          ) : isLimitReached ? (
            'Limit Reached'
          ) : (
            'Analyse'
          )}
        </button>
      </div>
      
      <div className="flex-1 min-h-[50vh] lg:min-h-0 bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden flex flex-col h-full w-full">
        <textarea 
          id="paste-code-textarea"
          value={pastedCode}
          onChange={(e) => setPastedCode(e.target.value)}
          placeholder="Paste or write your code here…"
          className="flex-1 w-full h-full min-h-0 p-4 sm:p-6 resize-none outline-none text-[13px] sm:text-[14px] font-mono text-gray-800 placeholder:text-gray-400 bg-transparent leading-relaxed overflow-auto"
          autoFocus={false}
          spellCheck={false}
        />
      </div>
    </motion.div>
  );
}
