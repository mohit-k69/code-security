import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Upload, FileText, X } from 'lucide-react';

interface UploadWorkflowProps {
  setActiveWorkflow: (workflow: 'none') => void;
  uploadedFiles: File[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setFileContents: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  handleFileUpload: (files: File[]) => void;
}

export function UploadWorkflow({
  setActiveWorkflow,
  uploadedFiles,
  setUploadedFiles,
  setFileContents,
  handleFileUpload
}: UploadWorkflowProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col h-full"
    >
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setActiveWorkflow('none')} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-[18px] font-semibold text-gray-900">Upload Files</h2>
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="w-full max-w-lg border-2 border-dashed border-[#d4c4bc] rounded-2xl p-12 flex flex-col items-center justify-center gap-4 bg-[#faf6f4] hover:bg-[#f5eeea] hover:border-[#b8a298] transition-all cursor-pointer group"
        >
          <div className="w-14 h-14 rounded-2xl bg-[#3f2a24] flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform">
            <Upload className="w-6 h-6" />
          </div>
          <div className="text-center">
            <p className="text-[15px] font-medium text-gray-800">Click to browse or drag and drop files here</p>
            <p className="text-[13px] text-gray-400 mt-2">Supports .js, .ts, .py, .java, .go, .rs and more</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.html,.css,.json,.xml,.yaml,.yml,.md,.txt,.sql,.sh,.bat,.swift,.kt,.dart,.vue,.svelte,.r,.scala,.lua,.pl,.m,.h,.hpp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileUpload(Array.from(e.target.files));
            }
            e.target.value = '';
          }}
        />

        {uploadedFiles.length > 0 && (
          <div className="w-full max-w-lg mt-8">
            <div className="text-[13px] font-medium text-gray-500 mb-3">Uploaded Files</div>
            <div className="flex flex-col gap-2">
              {uploadedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm group hover:border-red-200 transition-colors">
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-[14px] text-gray-700 truncate flex-1">{file.name}</span>
                  <span className="text-[12px] text-gray-400 flex-shrink-0">{(file.size / 1024).toFixed(1)} KB</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedFiles(prev => prev.filter((_, idx) => idx !== i));
                      setFileContents(prev => {
                        const next = new Map(prev);
                        next.delete(file.name);
                        return next;
                      });
                    }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
