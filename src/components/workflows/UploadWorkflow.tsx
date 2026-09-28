import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Upload, FileArchive, Image as ImageIcon, FileCode } from 'lucide-react';
import {
  runPreflightPipeline,
  INITIAL_PREFLIGHT_STEPS,
} from '../../lib/upload/preflightPipeline';
import { PreflightResult, PreflightStep, StepState, PreflightStepId } from '../../lib/upload/types';
import { UploadPreflightView, OcrState } from './upload/UploadPreflightView';
import {
  extractCodeFromImage,
  createProjectFileFromOcr,
  MIN_OCR_CONFIDENCE_THRESHOLD,
} from '../../lib/upload/ocrEngine';

interface UploadWorkflowProps {
  setActiveWorkflow: (workflow: 'none') => void;
  uploadedFiles: File[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setFileContents: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  handleFileUpload?: (files: File[]) => void;
  handleStartReview?: (result: PreflightResult) => void;
  isAnalyzing?: boolean;
  isLimitReached?: boolean;
  analysisResult?: any;
}

export function UploadWorkflow({
  setActiveWorkflow,
  uploadedFiles,
  setUploadedFiles,
  setFileContents,
  handleStartReview,
  isAnalyzing = false,
  isLimitReached = false,
}: UploadWorkflowProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [preflightSteps, setPreflightSteps] = useState<PreflightStep[]>(INITIAL_PREFLIGHT_STEPS);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [ocrState, setOcrState] = useState<OcrState>({
    isRunning: false,
    isComplete: false,
  });

  const handleReset = () => {
    setIsProcessing(false);
    setPreflightResult(null);
    setOcrState({ isRunning: false, isComplete: false });
    setPreflightSteps(INITIAL_PREFLIGHT_STEPS.map(s => ({ ...s, status: 'pending', details: undefined })));
    setUploadedFiles([]);
    setFileContents(new Map());
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processFiles = async (rawFiles: File[]) => {
    if (!rawFiles || rawFiles.length === 0) return;

    setIsProcessing(true);
    setPreflightResult(null);
    setOcrState({ isRunning: false, isComplete: false });

    // Initialize clean steps
    setPreflightSteps(INITIAL_PREFLIGHT_STEPS.map(s => ({ ...s, status: 'pending', details: undefined })));

    try {
      // Convert browser File instances to bytes for quarantined inspection
      const fileBuffers = await Promise.all(
        rawFiles.map(async (f) => {
          const arrayBuf = await f.arrayBuffer();
          return {
            name: f.name,
            bytes: new Uint8Array(arrayBuf),
            size: f.size,
          };
        })
      );

      const result = await runPreflightPipeline(fileBuffers, {
        onStepProgress: (stepId: PreflightStepId, state: StepState, details?: string) => {
          setPreflightSteps((prev) =>
            prev.map((step) =>
              step.id === stepId
                ? { ...step, status: state, details }
                : step
            )
          );
        },
      });

      // If upload is an image and passed initial preflight, run isolated OCR extraction
      if (result.uploadType === 'image' && result.overallStatus !== 'rejected' && result.imageMetadata) {
        setOcrState({ isRunning: true, isComplete: false });
        try {
          const ocrResult = await extractCodeFromImage(result.imageMetadata, fileBuffers[0].bytes);
          if (ocrResult.isReadable && ocrResult.confidence >= MIN_OCR_CONFIDENCE_THRESHOLD && ocrResult.content.trim()) {
            const ocrProjectFile = createProjectFileFromOcr(ocrResult);
            result.safeFiles = [ocrProjectFile];
            result.fileContentsMap.set(ocrProjectFile.relativePath, ocrProjectFile.untrustedContent);
            result.detectedLanguages = [ocrResult.language];
            setOcrState({
              isRunning: false,
              isComplete: true,
              confidence: ocrResult.confidence,
              language: ocrResult.language,
              extractedSnippet: ocrResult.content.slice(0, 300),
            });
          } else {
            setOcrState({
              isRunning: false,
              isComplete: false,
              error: ocrResult.error || "Couldn't reliably extract code from this image.",
            });
          }
        } catch (ocrErr: any) {
          console.error('[UploadWorkflow] OCR extraction failed:', ocrErr);
          setOcrState({
            isRunning: false,
            isComplete: false,
            error: ocrErr?.message || "Couldn't reliably extract code from this image.",
          });
        }
      }

      setPreflightResult(result);

      if (result.overallStatus !== 'rejected') {
        // Store encapsulated untrusted files in state for future pipeline consumption
        setUploadedFiles(rawFiles);
        setFileContents(result.fileContentsMap);
      } else {
        // On rejection, clear state
        setUploadedFiles([]);
        setFileContents(new Map());
      }
    } catch (err: any) {
      console.error('[UploadWorkflow] Preflight processing error:', err);
      setPreflightSteps((prev) =>
        prev.map((step) =>
          step.status === 'in_progress' ? { ...step, status: 'failed', details: 'Error occurred' } : step
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col h-full"
    >
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setActiveWorkflow('none')}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer"
          aria-label="Return home"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-baseline gap-3">
          <h2 className="text-[18px] font-semibold text-gray-900">Upload Files</h2>
          <span className="text-[12px] text-gray-400">Phase 2 Secure Intake & Review</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center pb-8">
        {!isProcessing && !preflightResult ? (
          <div className="w-full max-w-xl flex flex-col items-center gap-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`w-full border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group ${
                isDragOver
                  ? 'border-[#3f2a24] bg-[#f5eeea]'
                  : 'border-[#d4c4bc] bg-[#faf6f4] hover:bg-[#f5eeea] hover:border-[#b8a298]'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-[#3f2a24] flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6" />
              </div>

              <div className="text-center space-y-1">
                <p className="text-[15px] font-medium text-gray-800">
                  Click to browse or drag and drop files here
                </p>
                <p className="text-[13px] text-gray-500">
                  Accepts ZIP projects, code screenshots (PNG, JPG, WebP), or source code files
                </p>
              </div>

              <div className="flex items-center gap-5 pt-2 text-[12px] text-gray-400">
                <span className="flex items-center gap-1.5">
                  <FileArchive className="w-3.5 h-3.5 text-gray-500" /> ZIP projects (up to 25 MB)
                </span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-gray-500" /> Screenshots (PNG, JPG, WebP)
                </span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-gray-500" /> Source files (up to 2 MB)
                </span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".zip,.png,.jpg,.jpeg,.webp,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.rb,.php,.html,.css,.json,.xml,.yaml,.yml,.md,.txt,.sql,.sh,.swift,.kt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  processFiles(Array.from(e.target.files));
                }
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <UploadPreflightView
            steps={preflightSteps}
            isProcessing={isProcessing}
            preflightResult={preflightResult}
            onReset={handleReset}
            onStartReview={handleStartReview}
            isAnalyzing={isAnalyzing}
            isLimitReached={isLimitReached}
            ocrState={ocrState}
          />
        )}
      </div>
    </motion.div>
  );
}
