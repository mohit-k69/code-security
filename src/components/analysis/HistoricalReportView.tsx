import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Check, 
  AlertTriangle, 
  Calendar, 
  GitPullRequest, 
  FolderGit2, 
  FileCode2, 
  Layers,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import type { ReviewedItem } from '../../lib/reviewsService';
import {
  getRealWorldScenario,
  getFindingDisplayTitle
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
  const [expandedFindings, setExpandedFindings] = useState<Record<number, boolean>>({});

  const toggleFinding = (index: number) => {
    setExpandedFindings(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
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

  const allFindingsExpanded = allFindings.length > 0 && allFindings.every((_: any, idx: number) => !!expandedFindings[idx]);

  const toggleAllFindings = () => {
    if (allFindingsExpanded) {
      setExpandedFindings({});
    } else {
      const next: Record<number, boolean> = {};
      allFindings.forEach((_: any, idx: number) => {
        next[idx] = true;
      });
      setExpandedFindings(next);
    }
  };

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

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-5xl px-6 md:px-8 pt-4 pb-12 space-y-4 text-left">
        {/* 1. Navigation Header */}
        <div>
          <button
            id="back-to-reviews-btn"
            onClick={onBack}
            aria-label="Back to Reviews"
            title="Back to Reviews"
            className="p-2 -ml-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer inline-flex items-center shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Review Metadata Summary Bar */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-left">
          <div className="pb-4 border-b border-gray-200/80">
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

          <div className="pt-3 flex flex-wrap items-start gap-x-8 gap-y-3 text-xs">
            <div className="min-w-0 shrink-0">
              <span className="text-gray-500 block mb-0.5">Date Reviewed</span>
              <span className="font-medium text-gray-800 inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span>{dateFormatted}</span>
              </span>
            </div>

            {review.repoName && (
              <div className="min-w-0 max-w-xs sm:max-w-sm">
                <span className="text-gray-500 block mb-0.5">Repository</span>
                <span className="font-medium text-gray-800 inline-flex items-center gap-1.5 max-w-full">
                  <FolderGit2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span 
                    className="truncate block"
                    title={review.repoOwner ? `${review.repoOwner}/${review.repoName}` : review.repoName}
                  >
                    {review.repoOwner ? `${review.repoOwner}/${review.repoName}` : review.repoName}
                  </span>
                </span>
              </div>
            )}

            <div className="min-w-0 shrink-0">
              <span className="text-gray-500 block mb-0.5">Vulnerabilities</span>
              <span className="font-medium text-gray-800 inline-flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span>{totalFindings} {totalFindings === 1 ? 'finding' : 'findings'}</span>
              </span>
            </div>

            {review.commitSha && (
              <div className="min-w-0 shrink-0">
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
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-5 text-left flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <Check className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <h2 className="text-xl font-bold text-gray-900">PASS</h2>
              <span className="text-emerald-700 font-semibold text-sm">
                No security vulnerabilities detected.
              </span>
            </div>
          </div>
        ) : effectiveVerdict === 'FAIL' ? (
          <div className="bg-red-50/40 border border-red-200 rounded-xl p-5 text-left">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <h2 className="text-xl font-bold text-gray-900">FAIL</h2>
                <span className="text-red-700 font-semibold text-sm">
                  {totalFindings} security {totalFindings === 1 ? 'vulnerability' : 'vulnerabilities'} detected.
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-orange-50/40 border border-orange-200 rounded-xl p-5 text-left">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <h2 className="text-xl font-bold text-gray-900">NOT VERIFIED</h2>
                <span className="text-orange-800 font-medium text-sm">
                  Security could not be confidently verified because additional context is required.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 4. Failed Security Checkpoints & Findings */}
        {effectiveVerdict === 'FAIL' && totalFindings > 0 && (
          <div className="space-y-3 pt-2 text-left">
            <div className="flex items-center justify-between pb-1">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Security Findings ({totalFindings})
              </h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleAllFindings}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer transition-colors"
                >
                  {allFindingsExpanded ? 'Collapse All' : 'Expand All'}
                </button>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-200/80 shadow-xs text-left">
              {allFindings.map((finding: ProcessedFinding, i: number) => {
                const isCritical = finding._severityLabel === 'CRITICAL';
                const isHigh = finding._severityLabel === 'HIGH';
                const isMedium = finding._severityLabel === 'MEDIUM';

                const displayTitle = getFindingDisplayTitle(finding);
                const snippet = finding.evidence?.[0]?.snippet || finding.snippet || finding.code;
                const explanation = finding.description || finding.message || 'Vulnerability detected in source code.';
                const scenario = getRealWorldScenario(finding);
                const suggestion = finding.suggestion || finding.remediation;
                const isExpanded = !!expandedFindings[i];

                return (
                  <div key={i} className="transition-colors text-left">
                    {/* List Row (Clickable) */}
                    <button
                      type="button"
                      onClick={() => toggleFinding(i)}
                      className={`w-full text-left px-5 py-3.5 sm:py-4 flex items-center justify-between gap-4 hover:bg-gray-50/80 transition-colors cursor-pointer ${
                        isExpanded ? 'bg-gray-50/40' : ''
                      }`}
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <span className="text-sm font-semibold text-gray-500 w-5 shrink-0 text-left">
                          {i + 1}
                        </span>
                        <span className="font-semibold text-sm text-gray-900 truncate">
                          {displayTitle}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {finding.cwes && finding.cwes.length > 0 && (
                          <span className="text-xs font-mono bg-gray-100 border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
                            {finding.cwes[0]}
                          </span>
                        )}
                        <div className="text-gray-400 pl-0.5">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded Details Revealed On Click */}
                    {isExpanded && (
                      <div className="px-5 sm:px-6 pb-6 pt-3 bg-gray-50/50 border-t border-gray-100 space-y-4 text-left">
                        {/* Severity Badge & CWE Tags */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded border ${
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
                            <div className="flex flex-wrap gap-1.5">
                              {finding.cwes.map((cwe: string, idx: number) => (
                                <span key={idx} className="text-[10px] uppercase font-mono bg-white border border-gray-200 text-gray-700 px-2 py-0.5 rounded font-medium">
                                  {cwe}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Problematic Code Snippet (if available) */}
                        {snippet && (
                          <div className="rounded-lg bg-gray-900 p-3.5 overflow-x-auto border border-gray-800">
                            <code className="text-xs font-mono text-gray-100 whitespace-pre block">
                              {snippet}
                            </code>
                          </div>
                        )}

                        {/* Why it matters */}
                        {explanation && (
                          <div>
                            <h5 className="text-[14px] font-bold text-gray-900 mb-1 tracking-tight">
                              Why it matters
                            </h5>
                            <p className="text-gray-700 leading-relaxed text-sm">
                              {explanation}
                            </p>
                          </div>
                        )}

                        {/* Real-world Scenario */}
                        {scenario && (
                          <div className="pt-3 border-t border-gray-200/70">
                            <h5 className="text-[14px] font-bold text-gray-900 mb-1 tracking-tight">
                              Real-world scenario
                            </h5>
                            <p className="text-gray-700 leading-relaxed text-sm">
                              {scenario}
                            </p>
                          </div>
                        )}

                        {/* Recommended Remediation (if available) */}
                        {suggestion && (
                          <div className="pt-3 border-t border-gray-200/70">
                            <h5 className="text-[14px] font-bold text-gray-900 mb-1 tracking-tight">
                              Recommended Remediation
                            </h5>
                            <p className="text-gray-700 leading-relaxed text-sm">
                              {suggestion}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
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
