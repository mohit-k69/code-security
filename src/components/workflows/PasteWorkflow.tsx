import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Loader2 } from 'lucide-react';

interface PasteWorkflowProps {
  setActiveWorkflow: (workflow: 'none') => void;
  pastedCode: string;
  setPastedCode: (code: string) => void;
  handleCheckVibe: () => void;
  isAnalyzing: boolean;
}

export function PasteWorkflow({ setActiveWorkflow, pastedCode, setPastedCode, handleCheckVibe, isAnalyzing }: PasteWorkflowProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col h-full max-w-3xl mx-auto w-full"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveWorkflow('none')} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-[18px] font-semibold text-gray-900">Paste Code</h2>
        </div>
        <button
          onClick={handleCheckVibe}
          disabled={!pastedCode.trim() || isAnalyzing}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[13px] font-semibold transition-all shadow-sm ${
            pastedCode.trim() && !isAnalyzing
              ? 'bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow-md hover:-translate-y-0.5'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            'Analyze Code'
          )}
        </button>
      </div>
      
      <div className="flex-1 min-h-[65vh] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
        <textarea 
          value={pastedCode}
          onChange={(e) => setPastedCode(e.target.value)}
          placeholder="Paste your code snippet or file contents here..."
          className="flex-1 w-full p-6 resize-none outline-none text-[14px] font-mono text-gray-800 placeholder:text-gray-400 bg-transparent leading-relaxed"
        />
      </div>
    </motion.div>
  );
}
