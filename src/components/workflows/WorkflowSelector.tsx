import React from 'react';
import { motion } from 'motion/react';
import { Upload, Clipboard, Github, Check, Play, Sparkles } from 'lucide-react';

interface WorkflowSelectorProps {
  setActiveWorkflow: (workflow: 'none' | 'upload' | 'paste' | 'github') => void;
  hasUploadedCode: boolean;
  uploadedFilesCount: number;
  hasPastedCode: boolean;
  githubConnected: boolean;
  onAnalyze?: () => void;
  onLoadSampleAndAnalyze?: () => void;
}

export function WorkflowSelector({
  setActiveWorkflow,
  hasUploadedCode,
  uploadedFilesCount,
  hasPastedCode,
  githubConnected,
  onAnalyze,
  onLoadSampleAndAnalyze
}: WorkflowSelectorProps) {
  const canAnalyze = hasUploadedCode || hasPastedCode;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col items-center justify-center text-center max-w-xl mx-auto w-full h-full py-8"
    >
      <div className="mb-8">
        <h2 className="text-[28px] font-bold text-gray-900 tracking-tight mb-2">
          What's your code hiding?
        </h2>
        <p className="text-[14px] text-gray-500 max-w-[360px] mx-auto leading-relaxed">
          Select a workflow below to run deep security scanning, vulnerability detection, and code quality analysis.
        </p>
      </div>
      
      <div className="grid grid-cols-3 gap-4 w-full mb-8">
        {/* Upload Button */}
        <button 
          onClick={() => setActiveWorkflow('upload')}
          className={`h-[120px] flex flex-col items-center justify-center gap-2.5 rounded-2xl border shadow-sm hover:shadow-md transition-all group ${
            hasUploadedCode
              ? 'bg-emerald-50/80 border-emerald-300'
              : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
          }`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform ${
            hasUploadedCode
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-blue-50 text-blue-600'
          }`}>
            {hasUploadedCode ? <Check className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
          </div>
          <div className="flex flex-col items-center">
            <span className={`text-[13px] font-semibold ${hasUploadedCode ? 'text-emerald-800' : 'text-gray-900'}`}>
              {hasUploadedCode ? `${uploadedFilesCount} file${uploadedFilesCount > 1 ? 's' : ''}` : 'Upload Files'}
            </span>
            <span className="text-[11px] text-gray-400 font-medium">Browse files</span>
          </div>
        </button>

        {/* Paste Code Button */}
        <button 
          onClick={() => setActiveWorkflow('paste')}
          className={`h-[120px] flex flex-col items-center justify-center gap-2.5 rounded-2xl border shadow-sm hover:shadow-md transition-all group ${
            hasPastedCode
              ? 'bg-emerald-50/80 border-emerald-300'
              : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
          }`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform ${
            hasPastedCode
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-purple-50 text-purple-600'
          }`}>
            {hasPastedCode ? <Check className="w-5 h-5" /> : <Clipboard className="w-5 h-5" />}
          </div>
          <div className="flex flex-col items-center">
            <span className={`text-[13px] font-semibold ${hasPastedCode ? 'text-emerald-800' : 'text-gray-900'}`}>
              {hasPastedCode ? 'Code Ready' : 'Paste Code'}
            </span>
            <span className="text-[11px] text-gray-400 font-medium">Snippets & text</span>
          </div>
        </button>

        {/* Github Button */}
        <button 
          onClick={() => setActiveWorkflow('github')}
          className={`h-[120px] flex flex-col items-center justify-center gap-2.5 rounded-2xl border shadow-sm hover:shadow-md transition-all group ${
            githubConnected
              ? 'bg-emerald-50/80 border-emerald-300'
              : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
          }`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform ${
            githubConnected
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-gray-100 text-gray-900'
          }`}>
            {githubConnected ? <Check className="w-5 h-5" /> : <Github className="w-5 h-5" />}
          </div>
          <div className="flex flex-col items-center">
            <span className={`text-[13px] font-semibold ${githubConnected ? 'text-emerald-800' : 'text-gray-900'}`}>
              {githubConnected ? 'Connected' : 'GitHub'}
            </span>
            <span className="text-[11px] text-gray-400 font-medium">Repos & PRs</span>
          </div>
        </button>
      </div>

      {/* Action Zone: Analyze Code Button */}
      <div className="flex flex-col items-center gap-3 w-full max-w-sm">
        {canAnalyze ? (
          <button 
            onClick={onAnalyze}
            className="w-full py-3.5 px-6 bg-[#3f2a24] hover:bg-[#2a1b17] text-white text-[15px] font-semibold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2.5 group"
          >
            <Play className="w-4 h-4 fill-white group-hover:scale-110 transition-transform" />
            Analyze Code Now
          </button>
        ) : (
          <button
            onClick={() => setActiveWorkflow('paste')}
            className="w-full py-3.5 px-6 bg-[#3f2a24] hover:bg-[#2a1b17] text-white text-[15px] font-semibold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2.5"
          >
            <Clipboard className="w-4 h-4" />
            Paste Code to Analyze
          </button>
        )}

        {onLoadSampleAndAnalyze && (
          <button
            onClick={onLoadSampleAndAnalyze}
            className="text-[13px] text-gray-500 hover:text-gray-900 flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Or try with sample code
          </button>
        )}
      </div>
    </motion.div>
  );
}
