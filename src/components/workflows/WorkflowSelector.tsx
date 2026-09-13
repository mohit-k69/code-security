import React from 'react';
import { motion } from 'motion/react';
import { Upload, Clipboard, Github, Check } from 'lucide-react';

interface WorkflowSelectorProps {
  setActiveWorkflow: (workflow: 'none' | 'upload' | 'paste' | 'github') => void;
  hasUploadedCode: boolean;
  uploadedFilesCount: number;
  hasPastedCode: boolean;
  githubConnected: boolean;
  onClearState: () => void;
}

export function WorkflowSelector({
  setActiveWorkflow,
  hasUploadedCode,
  uploadedFilesCount,
  hasPastedCode,
  githubConnected,
  onClearState
}: WorkflowSelectorProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center justify-start text-center max-w-lg mx-auto w-full pt-4 sm:pt-6 md:pt-0 md:justify-center md:mt-20"
    >
      <div className="mb-6 md:mb-12">
        <h2 className="text-[22px] min-[375px]:text-[24px] md:text-[26px] font-semibold text-gray-900 tracking-tight mb-2 md:mb-3 px-2">
          What's your code hiding?
        </h2>
        <p className="text-[15px] text-gray-500 opacity-0 hover:opacity-100 transition-opacity duration-300 max-w-[280px] mx-auto leading-relaxed hidden md:block">
          Select a method below to let our AI analyze your code for bugs, security gaps, and performance issues.
        </p>
      </div>
      
      {/* Mobile: Constrained 2-column grid; Desktop: Centered horizontal flex row */}
      <div 
        id="cody-workflow-grid"
        className="grid grid-cols-2 gap-3 min-[360px]:gap-3.5 w-fit mx-auto md:flex md:items-center md:justify-center md:gap-6 md:w-full" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Row 1 / Col 1: Upload Files Button (Disabled - Coming Soon) */}
        <button 
          id="upload-files-card-btn"
          disabled
          type="button"
          aria-disabled="true"
          className="w-[144px] min-[360px]:w-[158px] min-[390px]:w-[164px] md:w-[145px] h-[80px] min-[360px]:h-[88px] min-[390px]:h-[91px] md:h-[110px] flex flex-col items-center justify-center gap-1 min-[360px]:gap-1.5 md:gap-1.5 rounded-2xl md:rounded-3xl border border-gray-200 bg-white shadow-xs md:shadow-sm cursor-not-allowed select-none transition-all p-2 min-[360px]:p-2.5 md:p-3"
          title="Upload Files - Coming Soon"
        >
          <div className="w-7 h-7 min-[360px]:w-7.5 min-[360px]:h-7.5 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-blue-50/70 text-blue-300 shrink-0">
            <Upload className="w-3.5 h-3.5 md:w-4 md:h-4" />
          </div>
          <div className="flex flex-col items-center gap-0.5 md:gap-1">
            <span className="text-[12px] min-[360px]:text-[12.5px] md:text-[13px] font-semibold text-gray-400 leading-tight">
              Upload Files
            </span>
            <span className="text-[9px] min-[360px]:text-[9.5px] md:text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200/60 px-1.5 py-0.2 md:px-2 md:py-0.5 rounded-full leading-tight">
              Coming Soon
            </span>
          </div>
        </button>

        {/* Row 1 / Col 2: Paste Code Button */}
        <button 
          id="paste-code-card-btn"
          type="button"
          onClick={() => setActiveWorkflow('paste')}
          className={`w-[144px] min-[360px]:w-[158px] min-[390px]:w-[164px] md:w-[145px] h-[80px] min-[360px]:h-[88px] min-[390px]:h-[91px] md:h-[110px] flex flex-col items-center justify-center gap-1.5 min-[360px]:gap-2 md:gap-3 rounded-2xl md:rounded-3xl border shadow-xs md:shadow-sm hover:shadow-md transition-all group p-2 min-[360px]:p-2.5 md:p-3 cursor-pointer ${
            hasPastedCode
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`w-7 h-7 min-[360px]:w-7.5 min-[360px]:h-7.5 md:w-10 md:h-10 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 ${
            hasPastedCode
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-purple-50 text-purple-600'
          }`}>
            {hasPastedCode ? <Check className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Clipboard className="w-3.5 h-3.5 md:w-4 md:h-4" />}
          </div>
          <div className="flex flex-col items-center gap-0.5 md:gap-1">
            <span className={`text-[12px] min-[360px]:text-[12.5px] md:text-[13px] font-semibold leading-tight ${hasPastedCode ? 'text-emerald-700' : 'text-gray-900'}`}>
              {hasPastedCode ? 'Code Added' : 'Paste Code'}
            </span>
            <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium px-2 leading-tight hidden md:block">Text or snippets</span>
          </div>
        </button>

        {/* Row 2 / Col 1: GitHub Button (Row 2 / Col 2 is empty) */}
        <button 
          id="github-card-btn"
          type="button"
          onClick={() => setActiveWorkflow('github')}
          className={`w-[144px] min-[360px]:w-[158px] min-[390px]:w-[164px] md:w-[145px] h-[80px] min-[360px]:h-[88px] min-[390px]:h-[91px] md:h-[110px] flex flex-col items-center justify-center gap-1.5 min-[360px]:gap-2 md:gap-3 rounded-2xl md:rounded-3xl border shadow-xs md:shadow-sm hover:shadow-md transition-all group p-2 min-[360px]:p-2.5 md:p-3 cursor-pointer ${
            githubConnected
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`w-7 h-7 min-[360px]:w-7.5 min-[360px]:h-7.5 md:w-10 md:h-10 rounded-full flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 ${
            githubConnected
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-gray-100 text-gray-900'
          }`}>
            {githubConnected ? <Check className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Github className="w-3.5 h-3.5 md:w-4 md:h-4" />}
          </div>
          <div className="flex flex-col items-center gap-0.5 md:gap-1">
            <span className={`text-[12px] min-[360px]:text-[12.5px] md:text-[13px] font-semibold leading-tight ${githubConnected ? 'text-emerald-700' : 'text-gray-900'}`}>
              {githubConnected ? 'Connected' : 'GitHub'}
            </span>
            <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium px-2 leading-tight text-center hidden md:block">Repos & PRs</span>
          </div>
        </button>
      </div>
    </motion.div>
  );
}
