import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Check, 
  AlertTriangle, 
  Download, 
  Copy, 
  Calendar, 
  GitPullRequest, 
  FolderGit2, 
  FileCode2, 
  Clock, 
  ShieldCheck, 
  ShieldAlert, 
  Layers
} from 'lucide-react';
import type { ReviewedItem } from '../../lib/reviewsService';
import {
  getRealWorldScenario,
  getFindingDisplayTitle,
  getCodingAgentPrompt,
  generateRemediationMarkdown,
  downloadMarkdownDocument
} from '../workflows/SecurityReportPanel';

interface HistoricalReportViewProps {
  key?: React.Key;
  review: ReviewedItem;
  onBack: () => void;
}

interface ProcessedFinding {
  [key: string]: any;
  _severityRank: number;
  _severityLabel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export function HistoricalReportView({ review, onBack }: HistoricalReportViewProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);

  const handleCopyPrompt = (promptText: string, index: number) => {
    navigator.clipboard.writeText(promptText);
    setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  // Check if review data is invalid or missing
  if (!review) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Unable to load this review.</h3>
        <p className="text-gray-500 text-sm max-w-md mb-6">
          The requested review record could not be found or loaded.
        </p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reviews
        </button>
      </div>
    );
  }

  const report = review.result;

  // Unloadable state if report is explicitly erroneous or empty when FAIL was recorded
  const isError = report?.error || (review.verdict === 'FAIL' && !report);
  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Unable to load this review.</h3>
        <p className="text-red-600 text-sm max-w-md mb-6">
          {report?.error || 'The analysis report data for this review is unavailable or corrupted.'}
        </p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reviews
        </button>
      </div>
    );
  }

  // Severity ranking: CRITICAL (0) -> HIGH (1) -> MEDIUM (2) -> LOW (3)
  const getSeverityInfo = (finding: any): { rank: number; label: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' } => {
    const sev = String(finding.severity || '').toLowerCase();
    if (sev === 'critical') return { rank: 0, label: 'CRITICAL' };
    if (sev === 'high') return { rank: 1, label: 'HIGH' };
    if (sev === 'warning' || sev === 'medium') return { rank: 2, label: 'MEDIUM' };
    return { rank: 3, label: 'LOW' };
  };

  // Collect all findings from array or categorized object
  let allFindings: ProcessedFinding[] = [];
  if (Array.isArray(report?.findings)) {
    allFindings = report.findings.map((f: any) => {
      const { rank, label } = getSeverityInfo(f);
      return { ...f, _severityRank: rank, _severityLabel: label };
    });
  } else if (report?.findings) {
    const criticalList = (report.findings?.critical || []).map((f: any) => ({ ...f, _severityRank: 0, _severityLabel: 'CRITICAL' as const }));
    const warningList = (report.findings?.warning || []).map((f: any) => ({ ...f, _severityRank: 2, _severityLabel: 'MEDIUM' as const }));
    const infoList = (report.findings?.info || []).map((f: any) => ({ ...f, _severityRank: 3, _severityLabel: 'LOW' as const }));
    allFindings = [...criticalList, ...warningList, ...infoList];
  }

  // Stable sort: CRITICAL -> HIGH -> MEDIUM -> LOW
  allFindings.sort((a, b) => a._severityRank - b._severityRank);

  const totalFindings = allFindings.length;

  const isPasteReview =
    review.reviewType === 'paste' ||
    report?.reviewType === 'paste' ||
    report?.repository?.name === 'paste_snippet';

  // Compute effective verdict
  let effectiveVerdict: 'PASS' | 'FAIL' | 'NOT_VERIFIED' | string = review.verdict || report?.verdict || 'PASS';
  if (isPasteReview) {
    effectiveVerdict = totalFindings === 0 ? 'PASS' : 'FAIL';
  } else if (review.verdict) {
    effectiveVerdict = review.verdict;
  } else if (report?.verdict) {
    effectiveVerdict = report.verdict;
  } else {
    effectiveVerdict = totalFindings === 0 ? 'PASS' : 'FAIL';
  }

  // Format date
  const reviewDate = review.date instanceof Date 
    ? review.date 
    : new Date(review.date || Date.now());
  const dateFormatted = !isNaN(reviewDate.getTime()) 
    ? reviewDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Recently';

  // Review type display
  const getReviewTypeLabel = () => {
    const type = review.reviewType || (isPasteReview ? 'paste' : report?.repository ? 'github' : 'upload');
    if (type === 'github') return 'GitHub Review';
    if (type === 'paste') return 'Paste Code';
    return 'File Upload';
  };

  const handleDownloadMarkdown = () => {
    try {
      const reportForDownload = {
        ...(report || {}),
        verdict: effectiveVerdict,
        repository: {
          name: review.repoName || review.name || 'code-review'
        }
      };
      const mdContent = generateRemediationMarkdown(reportForDownload, allFindings);
      const cleanName = (review.repoName || review.name || 'code-review').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      const fileName = `${cleanName}-security-remediation.md`;

      const success = downloadMarkdownDocument(fileName, mdContent);
      if (success) {
        setIsDownloaded(true);
        setTimeout(() => {
          setIsDownloaded(false);
        }, 2500);
      }
    } catch (err) {
      console.error('Failed to download markdown report:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto custom-scrollbar">
      {/* 1. Sticky Navigation Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-3.5 flex items-center justify-between gap-4">
        <button
          id="back-to-reviews-btn"
          onClick={onBack}
          aria-label="Back to Reviews"
          title="Back to Reviews"
          className="p-2 -ml-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {totalFindings > 0 && (
          <button
            id="historical-download-md-btn"
            onClick={handleDownloadMarkdown}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border cursor-pointer shrink-0 ${
              isDownloaded
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300'
            }`}
            title="Download remediation guide in markdown format"
          >
            {isDownloaded ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Downloaded</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-gray-500" />
                <span>Download Report (.md)</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="max-w-4xl w-full mx-auto p-6 md:p-8 space-y-6">
        {/* 2. Review Metadata Summary Bar */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200/80">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-700">
                  <FileCode2 className="w-3.5 h-3.5 text-gray-500" />
                  {getReviewTypeLabel()}
                </span>
                {review.pr !== null && review.pr !== undefined && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 border border-blue-200 text-blue-700">
                    <GitPullRequest className="w-3.5 h-3.5 text-blue-600" />
                    PR #{review.pr}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">{review.name}</h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span 
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                  effectiveVerdict === 'PASS'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : effectiveVerdict === 'FAIL'
                      ? 'bg-red-100 text-red-800 border border-red-200'
                      : 'bg-orange-100 text-orange-800 border border-orange-200'
                }`}
              >
                {effectiveVerdict === 'PASS' ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {effectiveVerdict}
              </span>
            </div>
          </div>

          <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-gray-500 block mb-0.5">Date Reviewed</span>
              <span className="font-medium text-gray-800 inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                {dateFormatted}
              </span>
            </div>

            {review.repoName && (
              <div>
                <span className="text-gray-500 block mb-0.5">Repository</span>
                <span className="font-medium text-gray-800 inline-flex items-center gap-1.5 truncate">
                  <FolderGit2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="truncate">{review.repoOwner ? `${review.repoOwner}/${review.repoName}` : review.repoName}</span>
                </span>
              </div>
            )}

            <div>
              <span className="text-gray-500 block mb-0.5">Vulnerabilities</span>
              <span className="font-medium text-gray-800 inline-flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-gray-400" />
                {totalFindings} {totalFindings === 1 ? 'finding' : 'findings'}
              </span>
            </div>

            {review.commitSha && (
              <div>
                <span className="text-gray-500 block mb-0.5">Commit</span>
                <span className="font-mono text-gray-800 font-medium">
                  {review.commitSha.slice(0, 7)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Overall Verdict Banner */}
        {effectiveVerdict === 'PASS' ? (
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-6 text-center sm:text-left flex flex-col sm:flex-row items-center gap-5">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <h2 className="text-2xl font-bold text-gray-900">PASS</h2>
              </div>
              <p className="text-gray-700 text-sm font-medium mb-1">
                No security vulnerabilities detected.
              </p>
              <p className="text-gray-500 text-xs leading-relaxed">
                All checked security checkpoints passed cleanly during this review scan.
              </p>
            </div>
          </div>
        ) : effectiveVerdict === 'FAIL' ? (
          <div className="bg-red-50/40 border border-red-200 rounded-xl p-6">
            <div className="flex items-center gap-3.5 mb-2">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-7 h-7 text-red-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">FAIL</h2>
                <p className="text-red-700 font-semibold text-sm">
                  {totalFindings} security {totalFindings === 1 ? 'vulnerability' : 'vulnerabilities'} detected.
                </p>
              </div>
            </div>
            <p className="text-gray-600 text-xs mt-2 leading-relaxed">
              Security vulnerabilities were detected in this historical review. Review the details, real-world consequences, and remediation steps below.
            </p>
          </div>
        ) : (
          <div className="bg-orange-50/40 border border-orange-200 rounded-xl p-6">
            <div className="flex items-center gap-3.5 mb-2">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-7 h-7 text-orange-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">NOT VERIFIED</h2>
                <p className="text-orange-800 font-medium text-sm">
                  Security could not be confidently verified because additional context is required.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 4. Failed Security Checkpoints & Findings */}
        {effectiveVerdict === 'FAIL' && totalFindings > 0 && (
          <div className="space-y-6 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900 uppercase tracking-wider text-xs">
                Security Findings ({totalFindings})
              </h3>
              <span className="text-xs text-gray-500">
                Sorted by severity: High to Low
              </span>
            </div>

            <div className="space-y-6">
              {allFindings.map((finding: ProcessedFinding, i: number) => {
                const isCritical = finding._severityLabel === 'CRITICAL';
                const isHigh = finding._severityLabel === 'HIGH';
                const isMedium = finding._severityLabel === 'MEDIUM';

                const displayTitle = getFindingDisplayTitle(finding);
                const snippet = finding.evidence?.[0]?.snippet || finding.snippet || finding.code;
                const explanation = finding.description || finding.message || 'Vulnerability detected in source code.';
                const scenario = getRealWorldScenario(finding);
                const suggestion = finding.suggestion || finding.remediation;
                const agentPrompt = getCodingAgentPrompt(finding);
                const isCopied = copiedIndex === i;

                return (
                  <div
                    key={i}
                    className={`border rounded-xl p-6 transition-all ${
                      isCritical || isHigh
                        ? 'border-red-200 bg-red-50/10'
                        : isMedium
                          ? 'border-orange-200 bg-orange-50/10'
                          : 'border-blue-200 bg-blue-50/10'
                    }`}
                  >
                    {/* Severity Badge & Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-md border ${
                          isCritical
                            ? 'bg-red-100 text-red-900 border-red-300'
                            : isHigh
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : isMedium
                                ? 'bg-orange-100 text-orange-800 border-orange-200'
                                : 'bg-blue-100 text-blue-800 border-blue-200'
                        }`}
                      >
                        {finding._severityLabel}
                      </span>

                      {finding.cwes && finding.cwes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {finding.cwes.map((cwe: string, idx: number) => (
                            <span key={idx} className="text-[10px] uppercase font-mono bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
                              {cwe}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Finding Title & Location */}
                    <h4
                      className={`text-lg font-bold mb-3 ${
                        isCritical || isHigh
                          ? 'text-red-950'
                          : isMedium
                            ? 'text-orange-950'
                            : 'text-blue-950'
                      }`}
                    >
                      {displayTitle}
                    </h4>

                    {/* Problematic Code Snippet (if available) */}
                    {snippet && (
                      <div className="rounded-lg bg-gray-900 p-4 mb-4 overflow-x-auto border border-gray-800">
                        <code className="text-xs font-mono text-gray-100 whitespace-pre">
                          {snippet}
                        </code>
                      </div>
                    )}

                    {/* Clear description: Why the code is vulnerable / Why it matters */}
                    {explanation && (
                      <div className="mb-4">
                        <h5 className="text-[15px] font-bold text-gray-900 mb-1.5 tracking-tight">
                          Why it matters
                        </h5>
                        <p className="text-gray-700 leading-relaxed text-sm">
                          {explanation}
                        </p>
                      </div>
                    )}

                    {/* Real-world Scenario: What could actually happen */}
                    <div className="mb-4 pt-3 border-t border-gray-100">
                      <h5 className="text-[15px] font-bold text-gray-900 mb-1.5 tracking-tight">
                        Real-world scenario
                      </h5>
                      <p className="text-gray-700 leading-relaxed text-sm">
                        {scenario}
                      </p>
                    </div>

                    {/* Recommended Remediation (if available) */}
                    {suggestion && (
                      <div className="mb-4 pt-3 border-t border-gray-100">
                        <h5 className="text-[15px] font-bold text-gray-900 mb-1.5 tracking-tight">
                          Recommended Remediation
                        </h5>
                        <p className="text-gray-700 leading-relaxed text-sm">
                          {suggestion}
                        </p>
                      </div>
                    )}

                    {/* Fix with Coding Agent Prompt */}
                    <div className="pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h5 className="text-[15px] font-bold text-gray-900 tracking-tight">
                          Fix with Coding Agent
                        </h5>
                        <button
                          onClick={() => handleCopyPrompt(agentPrompt, i)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border cursor-pointer ${
                            isCopied
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                          }`}
                          title="Copy prompt for AI coding agent"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-gray-500" />
                              <span>Copy Prompt</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                        <p className="text-xs font-mono text-gray-800 leading-relaxed break-words whitespace-pre-wrap select-all">
                          {agentPrompt}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
