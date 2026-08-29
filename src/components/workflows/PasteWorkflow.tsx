import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Play, Sparkles, Trash2 } from 'lucide-react';

interface PasteWorkflowProps {
  setActiveWorkflow: (workflow: 'none') => void;
  pastedCode: string;
  setPastedCode: (code: string) => void;
  handleCheckVibe: () => void;
}

const SAMPLE_CODE = `// Sample Authentication & Payment Service
import express from 'express';

const app = express();
const API_SECRET_KEY = "sk_live_99a82b4f912e41c88ab9134"; // Hardcoded secret

app.post('/api/user/eval', (req, res) => {
  const { code } = req.body;
  // Critical vulnerability: arbitrary code execution
  const result = eval(code);
  res.json({ result });
});

app.post('/api/profile/render', (req, res) => {
  const { bio } = req.body;
  // Critical vulnerability: XSS injection via innerHTML
  document.getElementById('user-bio').innerHTML = bio;
});

export default app;`;

export function PasteWorkflow({ setActiveWorkflow, pastedCode, setPastedCode, handleCheckVibe }: PasteWorkflowProps) {
  // Support Cmd+Enter / Ctrl+Enter to run analysis instantly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (pastedCode.trim()) {
          handleCheckVibe();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pastedCode, handleCheckVibe]);

  const handleLoadSample = () => {
    setPastedCode(SAMPLE_CODE);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col h-full max-w-5xl mx-auto w-full"
    >
      <div className="flex items-center gap-3 mb-4">
        <button 
          onClick={() => setActiveWorkflow('none')} 
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Back to workflows"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-[18px] font-semibold text-gray-900">Paste Code</h2>
          <p className="text-[12px] text-gray-500">Paste source code or snippets to perform a security and quality scan</p>
        </div>

        <div className="flex items-center gap-2">
          {pastedCode.trim() ? (
            <button
              onClick={() => setPastedCode('')}
              className="px-3 py-2 text-gray-500 hover:text-red-600 text-[13px] font-medium rounded-xl hover:bg-red-50 transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          ) : (
            <button
              onClick={handleLoadSample}
              className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[13px] font-medium rounded-xl transition-colors flex items-center gap-1.5 border border-amber-200"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Load Sample Code
            </button>
          )}

          <button 
            onClick={handleCheckVibe}
            disabled={!pastedCode.trim()}
            className="px-5 py-2.5 bg-[#3f2a24] text-white text-[14px] font-semibold rounded-xl hover:bg-[#2a1b17] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
          >
            <Play className="w-4 h-4 fill-white" />
            Analyze Code
          </button>
        </div>
      </div>
      
      <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col relative min-h-[350px]">
        <textarea 
          value={pastedCode}
          onChange={(e) => setPastedCode(e.target.value)}
          placeholder={`Paste your code snippet or file contents here...\n\n(Tip: Press Ctrl+Enter or ⌘+Enter to analyze instantly)`}
          className="flex-1 w-full p-6 resize-none outline-none text-[14px] font-mono text-gray-800 placeholder:text-gray-400 bg-transparent leading-relaxed custom-scrollbar"
        />

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[12px] text-gray-500 font-medium">
            {pastedCode.trim() 
              ? `${pastedCode.split('\n').length} lines • ${pastedCode.length} characters`
              : 'Waiting for code input • Press "Load Sample Code" to try an example'}
          </span>

          <button 
            onClick={handleCheckVibe}
            disabled={!pastedCode.trim()}
            className="px-6 py-2.5 bg-[#3f2a24] text-white text-[14px] font-semibold rounded-xl hover:bg-[#2a1b17] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg"
          >
            <Play className="w-4 h-4 fill-white" />
            Analyze Code
          </button>
        </div>
      </div>
    </motion.div>
  );
}
