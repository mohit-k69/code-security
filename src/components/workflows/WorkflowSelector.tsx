import React from 'react';
import { motion } from 'motion/react';
import { Upload, Clipboard, Github, Check } from 'lucide-react';

interface WorkflowSelectorProps {
  setActiveWorkflow: (workflow: 'none' | 'upload' | 'paste' | 'github') => void;
  hasUploadedCode: boolean;
  uploadedFilesCount: number;
  hasPastedCode: boolean;
  githubConnected: boolean;
}

export function WorkflowSelector({
  setActiveWorkflow,
  hasUploadedCode,
  uploadedFilesCount,
  hasPastedCode,
  githubConnected
}: WorkflowSelectorProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col items-center justify-center text-center max-w-lg mx-auto w-full h-full"
    >
      <div className="mb-12">
        <h2 className="text-[26px] font-semibold text-gray-900 tracking-tight mb-3">
          What's your code hiding?
        </h2>
        <p className="text-[15px] text-gray-500 opacity-0 hover:opacity-100 transition-opacity duration-300 max-w-[280px] mx-auto leading-relaxed">
          Select a method below to let our AI analyze your code for bugs, security gaps, and performance issues.
        </p>
      </div>
      
      <div className="flex items-center justify-center gap-6 w-full">
        {/* Upload Button */}
        <button 
          onClick={() => setActiveWorkflow('upload')}
          className={`w-[145px] h-[110px] flex flex-col items-center justify-center gap-3 rounded-3xl border shadow-sm hover:shadow-md transition-all group ${
            hasUploadedCode
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${
            hasUploadedCode
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-blue-50 text-blue-600'
          }`}>
            {hasUploadedCode ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className={`text-[13px] font-semibold ${hasUploadedCode ? 'text-emerald-700' : 'text-gray-900'}`}>
              {hasUploadedCode ? `${uploadedFilesCount} file${uploadedFilesCount > 1 ? 's' : ''}` : 'Upload Files'}
            </span>
            <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium px-2 leading-tight">Drop files here</span>
          </div>
        </button>

        {/* Paste Code Button */}
        <button 
          onClick={() => setActiveWorkflow('paste')}
          className={`w-[145px] h-[110px] flex flex-col items-center justify-center gap-3 rounded-3xl border shadow-sm hover:shadow-md transition-all group ${
            hasPastedCode
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${
            hasPastedCode
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-purple-50 text-purple-600'
          }`}>
            {hasPastedCode ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className={`text-[13px] font-semibold ${hasPastedCode ? 'text-emerald-700' : 'text-gray-900'}`}>
              {hasPastedCode ? 'Code Added' : 'Paste Code'}
            </span>
            <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium px-2 leading-tight">Text or snippets</span>
          </div>
        </button>

        {/* Github Button */}
        <button 
          onClick={() => setActiveWorkflow('github')}
          className={`w-[145px] h-[110px] flex flex-col items-center justify-center gap-3 rounded-3xl border shadow-sm hover:shadow-md transition-all group ${
            githubConnected
              ? 'bg-emerald-50 border-emerald-300'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${
            githubConnected
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-gray-100 text-gray-900'
          }`}>
            {githubConnected ? <Check className="w-4 h-4" /> : <Github className="w-4 h-4" />}
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className={`text-[13px] font-semibold ${githubConnected ? 'text-emerald-700' : 'text-gray-900'}`}>
              {githubConnected ? 'Connected' : 'GitHub'}
            </span>
            <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium px-2 leading-tight text-center">Repos & PRs</span>
          </div>
        </button>
      </div>
    </motion.div>
  );
}
