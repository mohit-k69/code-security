import React from 'react';
import { 
  ArrowLeft, 
  Check, 
  AlertTriangle, 
  Calendar, 
  GitPullRequest, 
  FileCode2, 
  Layers
} from 'lucide-react';
import type { ReviewedItem } from '../../lib/reviewsService';
import { GroupedFindingsList } from '../common/GroupedFindingsList';

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

  // Effective PR number and commit SHA
  const prNumber = review.pr ?? report?.pr ?? report?.prNumber ?? report?.repository?.prNumber ?? null;
  const commitSha = review.commitSha ?? report?.commitSha ?? report?.repository?.commitSha ?? null;

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

  const isGitHubReview = (review.reviewType || (report?.repository ? 'github' : '')) === 'github';

  // Primary Title:
  // GitHub: repository name (mohit-k69/repo-name or repo-name)
  // Non-GitHub: existing review/file/code identifier
  const repoOwner = review.repoOwner || report?.repository?.owner || null;
  const repoName = review.repoName || report?.repository?.name || null;
  const githubRepoTitle = repoOwner && repoName
    ? `${repoOwner}/${repoName}`
    : (repoName || (review.name && review.name.includes('/') ? review.name : review.name || 'Repository'));
  
  const primaryTitle = isGitHubReview
    ? githubRepoTitle
    : (review.name || (isPasteReview ? 'Pasted Code' : 'Uploaded File'));

  // Stored PR information for the second category
  const storedPrTitle = (report?.prTitle || report?.title || report?.pullRequest?.title || review.result?.prTitle || review.result?.title)?.trim();

  // Category 2 Label & Content
  const category2Label = isGitHubReview
    ? 'PR'
    : (isPasteReview ? 'Code Reviewed' : 'File Reviewed');

  const renderCategory2Value = () => {
    if (isGitHubReview) {
      if (storedPrTitle && prNumber !== null && prNumber !== undefined) {
        return (
          <span className="truncate block" title={`${storedPrTitle} / PR #${prNumber}`}>
            <span className="block truncate font-medium text-gray-800">{storedPrTitle}</span>
            <span className="text-gray-500 font-normal">PR #{prNumber}</span>
          </span>
        );
      }
      if (storedPrTitle) {
        return (
          <span className="truncate block font-medium text-gray-800" title={storedPrTitle}>
            {storedPrTitle}
          </span>
        );
      }
      if (prNumber !== null && prNumber !== undefined) {
        return (
          <span className="font-medium text-gray-800">
            PR #{prNumber}
          </span>
        );
      }
      return (
        <span className="font-medium text-gray-800 truncate block">
          Full Scan
        </span>
      );
    }

    // Non-GitHub reviews
    const nonGithubValue = review.name || (isPasteReview ? 'Pasted Snippet' : 'Uploaded File');
    return (
      <span className="truncate block font-medium text-gray-800" title={nonGithubValue}>
        {nonGithubValue}
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-5xl px-3.5 sm:px-6 md:px-8 pt-4 pb-12 space-y-4 text-left">
        {/* 1. Navigation Header */}
        <div>
          <button
            id="back-to-reviews-btn"
            onClick={onBack}
            aria-label="Back to Reviews"
            title="Back to Reviews"
            className="p-2 -ml-1 sm:-ml-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer inline-flex items-center shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        {/* 2. Review Metadata Summary Bar */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 sm:p-5 text-left">
          <div className="pb-4 border-b border-gray-200/80">
            <div className="flex items-center gap-2.5 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-700">
                <FileCode2 className="w-3.5 h-3.5 text-gray-500" />
                {getReviewTypeLabel()}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight break-words">{primaryTitle}</h1>
          </div>

          <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            {/* 1. Date Reviewed */}
            <div className="min-w-0">
              <span className="text-gray-500 block mb-0.5">Date Reviewed</span>
              <span className="font-medium text-gray-800 inline-flex items-center gap-1.5 max-w-full">
                <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="truncate block" title={dateFormatted}>
                  {dateFormatted}
                </span>
              </span>
            </div>

            {/* 2. PR / Code Reviewed / File Reviewed */}
            <div className="min-w-0">
              <span className="text-gray-500 block mb-0.5">{category2Label}</span>
              <div className="inline-flex items-center gap-1.5 max-w-full">
                {isGitHubReview ? (
                  <GitPullRequest className="w-3.5 h-3.5 text-gray-400 shrink-0 self-start mt-0.5" />
                ) : (
                  <FileCode2 className="w-3.5 h-3.5 text-gray-400 shrink-0 self-start mt-0.5" />
                )}
                <div className="min-w-0 max-w-full">
                  {renderCategory2Value()}
                </div>
              </div>
            </div>

            {/* 3. Vulnerabilities */}
            <div className="min-w-0">
              <span className="text-gray-500 block mb-0.5">Vulnerabilities</span>
              <span className="font-medium text-gray-800 inline-flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span>{totalFindings} {totalFindings === 1 ? 'finding' : 'findings'}</span>
              </span>
            </div>

            {/* 4. Result */}
            <div className="min-w-0">
              <span className="text-gray-500 block mb-0.5">Result</span>
              {effectiveVerdict === 'PASS' ? (
                <span className="font-bold text-emerald-600 inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>PASS</span>
                </span>
              ) : effectiveVerdict === 'FAIL' ? (
                <span className="font-bold text-red-600 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  <span>FAIL</span>
                </span>
              ) : (
                <span className="font-bold text-orange-600 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                  <span>NOT VERIFIED</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3. Security Findings List */}
        {totalFindings > 0 && (
          <div className="pt-2 text-left">
            <GroupedFindingsList
              findings={allFindings}
              title="Security Findings"
            />
          </div>
        )}
      </div>
    </div>
  );
}
