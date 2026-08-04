import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';

interface PasteWorkflowProps {
  setActiveWorkflow: (workflow: 'none') => void;
  pastedCode: string;
  setPastedCode: (code: string) => void;
}

export function PasteWorkflow({ setActiveWorkflow, pastedCode, setPastedCode }: PasteWorkflowProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col h-full"
    >
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setActiveWorkflow('none')} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-[18px] font-semibold text-gray-900">Paste Code</h2>
      </div>
      
      <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
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
