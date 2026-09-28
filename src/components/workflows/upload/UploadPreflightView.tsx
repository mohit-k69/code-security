import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileCode,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Loader2,
  FolderTree,
  EyeOff,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { PreflightResult, PreflightStep, StepState } from '../../../lib/upload/types';

export interface OcrState {
  isRunning: boolean;
  isComplete: boolean;
  error?: string;
  confidence?: number;
  language?: string;
  extractedSnippet?: string;
}

interface UploadPreflightViewProps {
  steps: PreflightStep[];
  isProcessing: boolean;
  preflightResult: PreflightResult | null;
  onReset: () => void;
  onStartReview?: (result: PreflightResult) => void;
  isAnalyzing?: boolean;
  isLimitReached?: boolean;
  ocrState?: OcrState;
}

export const UploadPreflightView: React.FC<UploadPreflightViewProps> = ({
  steps,
  isProcessing,
  preflightResult,
  onReset,
  onStartReview,
  isAnalyzing = false,
  isLimitReached = false,
  ocrState,
}) => {
  const [showFindingsList, setShowFindingsList] = useState(false);
  const [showFileList, setShowFileList] = useState(false);
  const [showOcrSnippet, setShowOcrSnippet] = useState(false);

  const getStepIcon = (state: StepState) => {
    switch (state) {
      case 'in_progress':
        return <Loader2 className="w-4 h-4 text-[#3f2a24] animate-spin shrink-0" />;
      case 'passed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />;
      default:
        return <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />;
    }
  };

  const getStepTextColor = (state: StepState) => {
    switch (state) {
      case 'in_progress':
        return 'text-gray-900 font-medium';
      case 'passed':
        return 'text-gray-700';
      case 'warning':
        return 'text-amber-800';
      case 'failed':
        return 'text-rose-700 font-medium';
      default:
        return 'text-gray-400';
    }
  };

  const isImageUpload = preflightResult?.uploadType === 'image';
  const isOcrRunning = ocrState?.isRunning;
  const isOcrFailed = Boolean(ocrState?.error);
  const threatDecision = preflightResult?.threatGateDecision || (preflightResult?.overallStatus === 'rejected' ? 'BLOCK' : preflightResult?.findings?.length ? 'FLAG' : 'ALLOW');
  const isBlocked = threatDecision === 'BLOCK' || preflightResult?.overallStatus === 'rejected';
  const isReadyForReview =
    Boolean(preflightResult) &&
    !isBlocked &&
    Boolean(preflightResult?.safeFiles && preflightResult.safeFiles.length > 0) &&
    (!isImageUpload || (ocrState?.isComplete && !isOcrFailed));

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
      {/* Preflight Header */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#3f2a24] flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-[16px] font-semibold text-gray-900 tracking-tight">
                {isProcessing
                  ? 'Checking your files…'
                  : isOcrRunning
                  ? 'Extracting code from screenshot…'
                  : preflightResult?.overallStatus === 'rejected' || isOcrFailed
                  ? 'Security Check Failed'
                  : 'Security Check Complete'}
              </h3>
              <p className="text-[13px] text-gray-500">
                {isProcessing
                  ? 'Verifying signatures, quarantine boundaries, and credential safety.'
                  : isOcrRunning
                  ? 'Isolating visual layout and reading code structure without executing.'
                  : preflightResult?.overallStatus === 'rejected' || isOcrFailed
                  ? 'The upload could not be verified safely.'
                  : 'Preflight verified. Content is isolated as unexecutable data.'}
              </p>
            </div>
          </div>
          {onReset && (
            <button
              onClick={onReset}
              className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Step-by-Step Security Pipeline Checklist */}
        <div className="border-t border-gray-100 pt-4 flex flex-col gap-2.5">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center justify-between py-1 text-[13px]">
              <div className="flex items-center gap-2.5">
                {getStepIcon(step.status)}
                <span className={getStepTextColor(step.status)}>{step.label}</span>
              </div>
              {step.details && (
                <span className="text-[12px] text-gray-400 font-mono truncate max-w-[200px]">
                  {step.details}
                </span>
              )}
            </div>
          ))}

          {/* Image OCR Step Indicator if Image */}
          {isImageUpload && (
            <div className="flex items-center justify-between py-1 text-[13px] border-t border-dashed border-gray-100 pt-2 mt-1">
              <div className="flex items-center gap-2.5">
                {isOcrRunning ? (
                  <Loader2 className="w-4 h-4 text-[#3f2a24] animate-spin shrink-0" />
                ) : ocrState?.isComplete ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : isOcrFailed ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />
                )}
                <span className={isOcrRunning ? 'text-gray-900 font-medium' : ocrState?.isComplete ? 'text-gray-700' : isOcrFailed ? 'text-rose-700' : 'text-gray-400'}>
                  Screenshot code extraction (OCR)
                </span>
              </div>
              <span className="text-[12px] text-gray-400 font-mono truncate max-w-[200px]">
                {isOcrRunning
                  ? 'Extracting…'
                  : ocrState?.isComplete
                  ? `${ocrState.language || 'Code'} (${Math.round((ocrState.confidence || 0.9) * 100)}%)`
                  : isOcrFailed
                  ? 'Extraction failed'
                  : 'Pending'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Summary & Action Box when Preflight Completes */}
      {preflightResult && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs flex flex-col gap-5"
        >
          {/* Status Banner */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              {preflightResult.overallStatus === 'passed' && !isOcrFailed && (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              )}
              {preflightResult.overallStatus === 'warning' && !isOcrFailed && (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              )}
              {(preflightResult.overallStatus === 'rejected' || isOcrFailed) && (
                <AlertCircle className="w-5 h-5 text-rose-600" />
              )}
              <div>
                <div className="text-[14px] font-semibold text-gray-900">
                  {preflightResult.overallStatus === 'rejected'
                    ? 'Upload Rejected'
                    : isOcrFailed
                    ? 'OCR Extraction Failed'
                    : isOcrRunning
                    ? 'Preparing code from screenshot…'
                    : 'Ready for Review'}
                </div>
                <div className="text-[12px] text-gray-500">
                  {preflightResult.primaryFileName} · {preflightResult.uploadType.toUpperCase()} format
                </div>
              </div>
            </div>
            <div className="text-right text-[12px] text-gray-500 font-mono">
              {(preflightResult.totalSizeBytes / 1024).toFixed(1)} KB
            </div>
          </div>

          {/* Compact Summary Metrics */}
          <div className="grid grid-cols-3 gap-3 py-1">
            <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-gray-50/70 border border-gray-100">
              <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Scanned</span>
              <span className="text-[18px] font-semibold text-gray-800">
                {preflightResult.filesAccepted} <span className="text-[12px] font-normal text-gray-500">files</span>
              </span>
            </div>
            <div className={`flex flex-col gap-0.5 p-3 rounded-xl border ${preflightResult.secretCount > 0 ? 'bg-amber-50/50 border-amber-200/60' : 'bg-gray-50/70 border-gray-100'}`}>
              <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Secrets</span>
              <span className={`text-[18px] font-semibold ${preflightResult.secretCount > 0 ? 'text-amber-800' : 'text-gray-800'}`}>
                {preflightResult.secretCount} <span className="text-[12px] font-normal text-gray-500">detected</span>
              </span>
            </div>
            <div className={`flex flex-col gap-0.5 p-3 rounded-xl border ${preflightResult.suspiciousFileCount > 0 ? 'bg-rose-50/50 border-rose-200/60' : 'bg-gray-50/70 border-gray-100'}`}>
              <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Suspicious</span>
              <span className={`text-[18px] font-semibold ${preflightResult.suspiciousFileCount > 0 ? 'text-rose-800' : 'text-gray-800'}`}>
                {preflightResult.suspiciousFileCount} <span className="text-[12px] font-normal text-gray-500">files</span>
              </span>
            </div>
          </div>

          {/* Threat Gate Decision Card */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 ${
            threatDecision === 'BLOCK'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : threatDecision === 'FLAG'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}>
            {threatDecision === 'BLOCK' ? (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            ) : threatDecision === 'FLAG' ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    threatDecision === 'BLOCK'
                      ? 'bg-rose-600 text-white'
                      : threatDecision === 'FLAG'
                        ? 'bg-amber-600 text-white'
                        : 'bg-emerald-600 text-white'
                  }`}>
                    Threat Gate: {threatDecision}
                  </span>
                  <strong className="text-[13px] font-semibold">
                    {threatDecision === 'BLOCK'
                      ? 'Upload Blocked'
                      : threatDecision === 'FLAG'
                        ? 'Risk Patterns Flagged'
                        : 'Upload Approved'}
                  </strong>
                </div>
              </div>
              <p className="text-[12px] opacity-90 leading-relaxed">
                {preflightResult.threatGate?.summary ||
                  (threatDecision === 'BLOCK'
                    ? preflightResult.errorMessage || 'Content blocked by Upload Threat Gate policy.'
                    : threatDecision === 'FLAG'
                      ? 'Potential secrets or risk indicators masked & sandboxed as inert DATA. Review permitted.'
                      : 'Clean source code approved for Cody Security Review.')}
              </p>
              {threatDecision === 'BLOCK' && preflightResult.threatGate?.blockedViolations && preflightResult.threatGate.blockedViolations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-rose-200/60 text-[11px] font-mono space-y-1">
                  {preflightResult.threatGate.blockedViolations.map((v, idx) => (
                    <div key={idx} className="text-rose-700">• {v}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* OCR Error State */}
          {isOcrFailed && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[13px] leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <strong className="font-semibold block mb-0.5">Extraction Quality Error</strong>
                {ocrState?.error || "Couldn't reliably extract code from this image."}
                <div className="mt-2 text-xs text-rose-700">
                  Please upload a higher-resolution screenshot or crop to the relevant code lines.
                </div>
              </div>
            </div>
          )}

          {/* Rejection Message if preflight rejected */}
          {preflightResult.errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[13px] leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <strong className="font-semibold block mb-0.5">Preflight Policy Violation</strong>
                {preflightResult.errorMessage}
              </div>
            </div>
          )}

          {/* OCR Success Preview Box */}
          {isImageUpload && ocrState?.isComplete && !isOcrFailed && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowOcrSnippet(!showOcrSnippet)}
                className="w-full px-4 py-3 bg-gray-50/80 hover:bg-gray-100/70 text-left flex items-center justify-between text-[13px] font-medium text-gray-700 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>Extracted Code ({ocrState.language || 'Source'})</span>
                </div>
                {showOcrSnippet ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              <AnimatePresence>
                {showOcrSnippet && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-3 bg-white max-h-56 overflow-y-auto custom-scrollbar font-mono text-[12px] text-gray-800 leading-relaxed whitespace-pre"
                  >
                    {ocrState.extractedSnippet || '// Code extracted successfully'}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Potential Secrets & Findings Preview (Values strictly masked) */}
          {preflightResult.findings.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowFindingsList(!showFindingsList)}
                className="w-full px-4 py-3 bg-gray-50/80 hover:bg-gray-100/70 text-left flex items-center justify-between text-[13px] font-medium text-gray-700 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-amber-600" />
                  <span>Security Findings & Masked Secrets ({preflightResult.findings.length})</span>
                </div>
                {showFindingsList ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              <AnimatePresence>
                {showFindingsList && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-3 bg-white divide-y divide-gray-100 max-h-64 overflow-y-auto custom-scrollbar"
                  >
                    {preflightResult.findings.map((finding) => (
                      <div key={finding.id} className="py-2.5 first:pt-1 last:pb-1 flex flex-col gap-1 text-[12px]">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{finding.rule}</span>
                          <span className="text-gray-400 font-mono">{finding.fileName}{finding.line ? `:${finding.line}` : ''}</span>
                        </div>
                        <div className="text-gray-600">{finding.description}</div>
                        {finding.maskedSnippet && (
                          <div className="p-1.5 rounded-md bg-gray-50 border border-gray-200 font-mono text-[11px] text-gray-700 truncate">
                            {finding.maskedSnippet}
                          </div>
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Extracted Project Files Tree */}
          {preflightResult.safeFiles.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowFileList(!showFileList)}
                className="w-full px-4 py-3 bg-gray-50/80 hover:bg-gray-100/70 text-left flex items-center justify-between text-[13px] font-medium text-gray-700 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-[#3f2a24]" />
                  <span>Project File Tree ({preflightResult.safeFiles.length} files)</span>
                </div>
                {showFileList ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              <AnimatePresence>
                {showFileList && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-3 bg-white divide-y divide-gray-100 max-h-56 overflow-y-auto custom-scrollbar"
                  >
                    {preflightResult.safeFiles.map((f, i) => (
                      <div key={i} className="py-2 first:pt-1 last:pb-1 flex items-center justify-between text-[12px]">
                        <div className="flex items-center gap-2 truncate">
                          <FileCode className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="font-mono text-gray-800 truncate">{f.relativePath}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-gray-400 text-[11px]">
                          <span>{f.detectedLanguage}</span>
                          <span>{(f.size / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Primary Action Button: Hand Off to Existing Security Review Pipeline */}
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => onStartReview && onStartReview(preflightResult)}
              disabled={!isReadyForReview || isAnalyzing || isLimitReached || isBlocked}
              className={`w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-[14px] font-semibold transition-all shadow-sm ${
                isReadyForReview && !isAnalyzing && !isLimitReached && !isBlocked
                  ? 'bg-[#3f2a24] text-white hover:bg-[#2c1d19] hover:shadow-md cursor-pointer hover:-translate-y-0.5'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Running Security Review…</span>
                </>
              ) : isLimitReached ? (
                <span>Free Review Limit Reached</span>
              ) : isBlocked ? (
                <span>Upload Blocked (Unsafe Content)</span>
              ) : isOcrRunning ? (
                <span>Extracting Code from Image…</span>
              ) : isOcrFailed ? (
                <span>OCR Failed — Upload Clearer Image</span>
              ) : (
                <>
                  <span>Start Security Review</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center text-[12px] text-gray-400">
              Content is isolated as read-only untrusted data · Ready for Cody security review
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
