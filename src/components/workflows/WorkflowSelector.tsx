import React from 'react';
import { motion } from 'motion/react';
import { Upload, Clipboard, Github, Check } from 'lucide-react';

interface WorkflowSelectorProps {
  setActiveWorkflow: (workflow: 'none' | 'upload' | 'paste' | 'github' | 'sync') => void;
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
        className="grid grid-cols-2 gap-2.5 min-[375px]:gap-3 min-[414px]:gap-3.5 w-fit mx-auto md:flex md:items-center md:justify-center md:gap-6 md:w-full" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Row 1 / Col 1: Upload Files Button */}
        <button 
          id="upload-files-card-btn"
          type="button"
          onClick={() => setActiveWorkflow('upload')}
          className={`w-[142px] min-[360px]:w-[160px] min-[375px]:w-[168px] min-[390px]:w-[176px] min-[414px]:w-[187px] md:w-[145px] h-[78px] min-[360px]:h-[87px] min-[375px]:h-[92px] min-[390px]:h-[96px] min-[414px]:h-[102px] md:h-[110px] flex flex-col items-start justify-end gap-1.5 min-[375px]:gap-2 md:items-center md:justify-center md:gap-3 rounded-2xl md:rounded-3xl border shadow-xs md:shadow-sm hover:shadow-md transition-all group p-3.5 min-[360px]:p-4 min-[375px]:p-4.5 md:p-3 cursor-pointer ${
            hasUploadedCode
              ? 'bg-emerald-50/80 border-emerald-300'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`transition-transform group-hover:scale-105 shrink-0 self-start md:self-center md:w-10 md:h-10 md:rounded-full md:flex md:items-center md:justify-center ${
            hasUploadedCode
              ? 'text-emerald-600 md:bg-emerald-100'
              : 'text-[#f95738] md:bg-blue-50 md:text-blue-600'
          }`}>
            {hasUploadedCode ? (
              <Check className="w-4.5 h-4.5 min-[375px]:w-5 min-[375px]:h-5 md:w-4 md:h-4 stroke-[2]" />
            ) : (
              <Upload className="w-4.5 h-4.5 min-[375px]:w-5 min-[375px]:h-5 md:w-4 md:h-4 stroke-[2]" />
            )}
          </div>
          <div className="flex flex-col items-start md:items-center text-left md:text-center gap-0.5 md:gap-1">
            <span className={`text-[12.5px] min-[375px]:text-[13px] min-[414px]:text-[13.5px] md:text-[13px] font-medium leading-tight ${hasUploadedCode ? 'text-emerald-700 font-semibold' : 'text-gray-900'}`}>
              {hasUploadedCode ? (uploadedFilesCount > 1 ? `${uploadedFilesCount} Files` : 'File Added') : 'Upload Files'}
            </span>
            <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium px-2 leading-tight text-center hidden md:block">
              ZIP or images
            </span>
          </div>
        </button>

        {/* Row 1 / Col 2: Paste Code Button */}
        <button 
          id="paste-code-card-btn"
          type="button"
          onClick={() => setActiveWorkflow('paste')}
          className={`w-[142px] min-[360px]:w-[160px] min-[375px]:w-[168px] min-[390px]:w-[176px] min-[414px]:w-[187px] md:w-[145px] h-[78px] min-[360px]:h-[87px] min-[375px]:h-[92px] min-[390px]:h-[96px] min-[414px]:h-[102px] md:h-[110px] flex flex-col items-start justify-end gap-1.5 min-[375px]:gap-2 md:items-center md:justify-center md:gap-3 rounded-2xl md:rounded-3xl border shadow-xs md:shadow-sm hover:shadow-md transition-all group p-3.5 min-[360px]:p-4 min-[375px]:p-4.5 md:p-3 cursor-pointer ${
            hasPastedCode
              ? 'bg-emerald-50/80 border-emerald-300'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`transition-transform group-hover:scale-105 shrink-0 self-start md:self-center md:w-10 md:h-10 md:rounded-full md:flex md:items-center md:justify-center ${
            hasPastedCode
              ? 'text-emerald-600 md:bg-emerald-100'
              : 'text-[#9d4edd] md:bg-purple-50 md:text-purple-600'
          }`}>
            {hasPastedCode ? (
              <Check className="w-4.5 h-4.5 min-[375px]:w-5 min-[375px]:h-5 md:w-4 md:h-4 stroke-[2]" />
            ) : (
              <Clipboard className="w-4.5 h-4.5 min-[375px]:w-5 min-[375px]:h-5 md:w-4 md:h-4 stroke-[2]" />
            )}
          </div>
          <div className="flex flex-col items-start md:items-center text-left md:text-center gap-0.5 md:gap-1">
            <span className={`text-[12.5px] min-[375px]:text-[13px] min-[414px]:text-[13.5px] md:text-[13px] font-medium leading-tight ${hasPastedCode ? 'text-emerald-700 font-semibold' : 'text-gray-900'}`}>
              {hasPastedCode ? 'Code Added' : 'Paste Code'}
            </span>
            <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium px-2 leading-tight hidden md:block">
              Text or snippets
            </span>
          </div>
        </button>

        {/* Row 2 / Col 1: Sync Code Button (Row 2 / Col 2 is empty) */}
        <button 
          id="sync-code-card-btn"
          type="button"
          onClick={() => setActiveWorkflow('sync')}
          className={`w-[142px] min-[360px]:w-[160px] min-[375px]:w-[168px] min-[390px]:w-[176px] min-[414px]:w-[187px] md:w-[145px] h-[78px] min-[360px]:h-[87px] min-[375px]:h-[92px] min-[390px]:h-[96px] min-[414px]:h-[102px] md:h-[110px] flex flex-col items-start justify-end gap-1.5 min-[375px]:gap-2 md:items-center md:justify-center md:gap-3 rounded-2xl md:rounded-3xl border shadow-xs md:shadow-sm hover:shadow-md transition-all group p-3.5 min-[360px]:p-4 min-[375px]:p-4.5 md:p-3 cursor-pointer ${
            githubConnected
              ? 'bg-emerald-50/80 border-emerald-300'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`transition-transform group-hover:scale-105 shrink-0 self-start md:self-center md:w-10 md:h-10 md:rounded-full md:flex md:items-center md:justify-center ${
            githubConnected
              ? 'text-emerald-600 md:bg-emerald-100'
              : 'text-[#023e8a] md:bg-gray-100 md:text-gray-900'
          }`}>
            {githubConnected ? (
              <Check className="w-4.5 h-4.5 min-[375px]:w-5 min-[375px]:h-5 md:w-4 md:h-4 stroke-[2]" />
            ) : (
              <Github className="w-4.5 h-4.5 min-[375px]:w-5 min-[375px]:h-5 md:w-4 md:h-4 stroke-[2]" />
            )}
          </div>
          <div className="flex flex-col items-start md:items-center text-left md:text-center gap-0.5 md:gap-1">
            <span className={`text-[12.5px] min-[375px]:text-[13px] min-[414px]:text-[13.5px] md:text-[13px] font-medium leading-tight ${githubConnected ? 'text-emerald-700 font-semibold' : 'text-gray-900'}`}>
              {githubConnected ? 'Connected' : 'Sync Code'}
            </span>
            <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium px-2 leading-tight text-center hidden md:block">
              Repos & PRs
            </span>
          </div>
        </button>
      </div>
    </motion.div>
  );
}
