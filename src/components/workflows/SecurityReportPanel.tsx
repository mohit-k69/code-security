import React, { useState } from 'react';
import { Check, AlertTriangle, Loader2, ShieldCheck, Download } from 'lucide-react';
import { GroupedFindingsList } from '../common/GroupedFindingsList';
import {
  type FindingGroup,
  getCategoryFromRule,
  getCleanIssueName,
  getFindingRule,
  getSeverityRank,
  groupFindingsByRule,
  getGroupBadge,
  getRealWorldScenario,
  getImpactSectionTitle,
  getCategoryBadge,
  getFindingDisplayTitle,
  getCodingAgentPrompt,
} from '../../lib/findingsGrouping';

export {
  type FindingGroup,
  getCategoryFromRule,
  getCleanIssueName,
  getFindingRule,
  getSeverityRank,
  groupFindingsByRule,
  getGroupBadge,
  getRealWorldScenario,
  getImpactSectionTitle,
  getCategoryBadge,
  getFindingDisplayTitle,
  getCodingAgentPrompt,
};

interface SecurityReportPanelProps {
  report: any;
  isAnalyzing: boolean;
  workflow?: string;
  analysisError?: string | null;
}


/**
 * Safely wraps code snippets in markdown code fences.
 */
function safeCodeFence(code: string, lang = 'javascript'): string {
  if (!code) return '';
  const fence = code.includes('```') ? '````' : '```';
  return `${fence}${lang}\n${code}\n${fence}`;
}

/**
 * Downloads generated Markdown document to user device.
 */
export function downloadMarkdownDocument(fileName: string, content: string): boolean {
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('Failed to download markdown document:', err);
    return false;
  }
}

/**
 * Generates structured Markdown remediation document separated by category.
 */
export function generateRemediationMarkdown(report: any, findings: any[]): string {
  const timestamp = report?.generatedAt || report?.timestamp || new Date().toISOString();
  const dateStr = new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const targetName = report?.repository?.name || (typeof report?.repository === 'string' ? report.repository : null) || report?.target || 'Code Review';
  const totalFindings = findings.length;

  const securityFindings = findings.filter(f => (f.category || getCategoryFromRule(f.rule)) === 'security');
  const qualityFindings = findings.filter(f => (f.category || getCategoryFromRule(f.rule)) === 'quality');
  const bpFindings = findings.filter(f => (f.category || getCategoryFromRule(f.rule)) === 'bestPractices');
  const perfFindings = findings.filter(f => (f.category || getCategoryFromRule(f.rule)) === 'performance');
  const styleFindings = findings.filter(f => (f.category || getCategoryFromRule(f.rule)) === 'style');

  const highCount = securityFindings.filter(f => f._severityLabel === 'HIGH' || f._severityLabel === 'CRITICAL').length;
  const medCount = securityFindings.filter(f => f._severityLabel === 'MEDIUM').length;
  const lowCount = securityFindings.filter(f => f._severityLabel === 'LOW').length;

  const lines: string[] = [];

  // Document Title & Context
  lines.push(`# Security Vulnerability Remediation Guide`);
  lines.push(``);
  lines.push(`> **Target:** \`${targetName}\`  `);
  lines.push(`> **Security Verdict:** **${report?.verdict || (securityFindings.length === 0 ? 'PASS' : 'FAIL')}**  `);
  lines.push(`> **Security Vulnerabilities:** ${securityFindings.length} (${highCount} High, ${medCount} Medium, ${lowCount} Low)  `);
  lines.push(`> **Quality Issues:** ${qualityFindings.length}  `);
  lines.push(`> **Best Practice Findings:** ${bpFindings.length}  `);
  lines.push(`> **Performance Findings:** ${perfFindings.length}  `);
  lines.push(`> **Style Findings:** ${styleFindings.length}  `);
  lines.push(`> **Generated At:** ${dateStr}  `);
  lines.push(``);

  // Instructions
  lines.push(`## Instructions for AI Coding Agent`);
  lines.push(`You are an expert software engineer and application security specialist.`);
  lines.push(`Your objective is to remediate the identified findings with clean, surgical, robust code modifications.`);
  lines.push(``);

  // Summary Table
  lines.push(`## Summary of Findings`);
  lines.push(``);
  lines.push(`| # | Category | Severity / Type | Rule / Issue | Location |`);
  lines.push(`|---|---|---|---|---|`);
  findings.forEach((finding, idx) => {
    const cat = (finding.category || getCategoryFromRule(finding.rule)).toUpperCase();
    const badge = getCategoryBadge(finding).label;
    const name = getCleanIssueName(finding);
    const file = finding.primaryLocation?.file || finding.file || 'source';
    const line = finding.primaryLocation?.line || finding.line || '';
    const loc = line ? `${file}:${line}` : file;
    lines.push(`| ${idx + 1} | ${cat} | ${badge} | \`${name}\` | \`${loc}\` |`);
  });
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // Detailed Tasks
  lines.push(`## Remediation Tasks`);
  lines.push(``);

  findings.forEach((finding, idx) => {
    const num = idx + 1;
    const badge = getCategoryBadge(finding).label;
    const name = getCleanIssueName(finding);
    const displayTitle = getFindingDisplayTitle(finding);
    const file = finding.primaryLocation?.file || finding.file || 'source';
    const line = finding.primaryLocation?.line || finding.line;
    const snippet = finding.evidence?.[0]?.snippet || finding.snippet || finding.code;
    const description = finding.description || finding.message || 'Issue detected in source code.';
    const scenario = getRealWorldScenario(finding);
    const impactTitle = getImpactSectionTitle(finding);
    const suggestion = finding.suggestion || finding.remediation || 'Refactor code according to standards.';
    const prompt = getCodingAgentPrompt(finding);
    const cwes = finding.cwes && finding.cwes.length > 0 ? finding.cwes.join(', ') : null;

    lines.push(`### Task ${num}: ${name} (${badge})`);
    lines.push(``);
    lines.push(`- **Finding:** ${displayTitle}`);
    lines.push(`- **Location:** \`${file}${line ? `:${line}` : ''}\``);
    if (cwes) lines.push(`- **CWE:** ${cwes}`);
    lines.push(``);

    if (snippet) {
      lines.push(`#### Relevant Code`);
      lines.push(safeCodeFence(snippet));
      lines.push(``);
    }

    lines.push(`#### Issue Description`);
    lines.push(description);
    lines.push(``);

    lines.push(`#### ${impactTitle}`);
    lines.push(scenario);
    lines.push(``);

    lines.push(`#### Required Fix`);
    lines.push(suggestion);
    lines.push(``);

    lines.push(`#### Action Prompt for Agent`);
    lines.push('````markdown');
    lines.push(prompt);
    lines.push('````');
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  });

  return lines.join('\n');
}

export function SecurityReportPanel({ 
  report, 
  isAnalyzing,
  workflow,
  analysisError
}: SecurityReportPanelProps) {
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [activeCategoryTab, setActiveCategoryTab] = useState<'all' | 'security' | 'quality' | 'bestPractices' | 'performance' | 'style'>('all');

  if (isAnalyzing) {
    return (
      <div className="w-full bg-white border-l border-gray-200 flex flex-col items-center justify-center h-full p-8 text-center shrink-0">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <h3 className="text-gray-900 font-medium text-lg">Running Security Review...</h3>
        <p className="text-gray-500 text-sm mt-2">Checking your code against security checkpoints and code standards.</p>
      </div>
    );
  }

  if (analysisError || report?.error) {
    return (
      <div className="w-full bg-white border-l border-gray-200 flex flex-col items-center justify-center h-full p-8 text-center shrink-0">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <h3 className="text-gray-900 font-medium text-lg">Analysis Error</h3>
        <p className="text-red-600 text-sm mt-2 max-w-xs text-center">
          {analysisError || report?.error || 'Security analysis encountered an error. Please try again.'}
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="w-full bg-white border-l border-gray-200 flex flex-col items-center justify-center h-full p-8 text-center shrink-0">
        <div className="mb-32 flex flex-col items-center">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
            <ShieldCheck className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-gray-900 font-medium text-lg">No Analysis Results</h3>
          <p className="text-gray-500 text-sm mt-2">Your security analysis will appear here.</p>
        </div>
      </div>
    );
  }

  const getSeverityRank = (finding: any): { rank: number; label: 'HIGH' | 'MEDIUM' | 'LOW' } => {
    const sev = String(finding.severity || '').toLowerCase();
    if (sev === 'critical' || sev === 'high') {
      return { rank: 1, label: 'HIGH' };
    }
    if (sev === 'warning' || sev === 'medium') {
      return { rank: 2, label: 'MEDIUM' };
    }
    return { rank: 3, label: 'LOW' };
  };

  let allFindings: any[] = [];
  if (Array.isArray(report.findings)) {
    allFindings = report.findings.map((f: any) => {
      const { rank, label } = getSeverityRank(f);
      const cat = f.category || getCategoryFromRule(f.rule);
      return { ...f, category: cat, _severityRank: rank, _severityLabel: label };
    });
  } else if (report.findings) {
    const criticalList = (report.findings?.critical || []).map((f: any) => ({ ...f, category: f.category || getCategoryFromRule(f.rule), _severityRank: 1, _severityLabel: 'HIGH' as const }));
    const warningList = (report.findings?.warning || []).map((f: any) => ({ ...f, category: f.category || getCategoryFromRule(f.rule), _severityRank: 2, _severityLabel: 'MEDIUM' as const }));
    const infoList = (report.findings?.info || []).map((f: any) => ({ ...f, category: f.category || getCategoryFromRule(f.rule), _severityRank: 3, _severityLabel: 'LOW' as const }));
    allFindings = [...criticalList, ...warningList, ...infoList];
  }

  // Stable sort: Security findings first (HIGH -> MEDIUM -> LOW), followed by quality, bestPractices, performance, style
  const categoryOrder: Record<string, number> = {
    security: 1,
    quality: 2,
    bestPractices: 3,
    performance: 4,
    style: 5,
  };

  allFindings.sort((a, b) => {
    const catA = categoryOrder[a.category] || 99;
    const catB = categoryOrder[b.category] || 99;
    if (catA !== catB) return catA - catB;
    return a._severityRank - b._severityRank;
  });

  const securityFindings = allFindings.filter(f => f.category === 'security');
  const qualityFindings = allFindings.filter(f => f.category === 'quality');
  const bpFindings = allFindings.filter(f => f.category === 'bestPractices');
  const perfFindings = allFindings.filter(f => f.category === 'performance');
  const styleFindings = allFindings.filter(f => f.category === 'style');

  const securityCount = securityFindings.length;
  const qualityCount = qualityFindings.length;
  const bpCount = bpFindings.length;
  const perfCount = perfFindings.length;
  const styleCount = styleFindings.length;
  const totalFindings = allFindings.length;

  const isPasteReview =
    workflow === 'paste' ||
    report?.reviewType === 'paste' ||
    report?.repository?.name === 'paste_snippet';

  // Security-Driven Verdict:
  // Verdict is based strictly on security findings:
  // - Critical/High security vulnerabilities cause FAIL
  // - 0 security findings always yield PASS (even if quality/style findings exist)
  let effectiveVerdict: 'PASS' | 'FAIL' | 'NOT_VERIFIED' = 'PASS';
  if (report.verdict) {
    effectiveVerdict = report.verdict;
  } else if (securityCount > 0) {
    effectiveVerdict = securityFindings.some(f => f._severityLabel === 'HIGH') ? 'FAIL' : 'NOT_VERIFIED';
  } else {
    effectiveVerdict = 'PASS';
  }

  // If Paste Review and security vulnerabilities detected -> FAIL, otherwise PASS
  if (isPasteReview) {
    effectiveVerdict = securityCount > 0 ? 'FAIL' : 'PASS';
  }

  // Filtered findings by active category tab
  const displayedFindings = activeCategoryTab === 'all'
    ? allFindings
    : allFindings.filter(f => f.category === activeCategoryTab);



  const handleDownloadMarkdown = () => {
    try {
      const reportForDownload = {
        ...report,
        verdict: effectiveVerdict
      };
      const mdContent = generateRemediationMarkdown(reportForDownload, allFindings);
      const rawName = report.repository?.name || (typeof report.repository === 'string' ? report.repository : null) || 'code';
      const cleanName = rawName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || 'code';
      const fileName = `${cleanName}-security-remediation.md`;

      const success = downloadMarkdownDocument(fileName, mdContent);
      if (success) {
        setIsDownloaded(true);
        setTimeout(() => {
          setIsDownloaded(false);
        }, 2500);
      }
    } catch (err) {
      console.error('Failed to download markdown file:', err);
    }
  };

  // Pure clean PASS with zero issues anywhere
  if (effectiveVerdict === 'PASS' && totalFindings === 0) {
    return (
      <div className="w-full bg-white border-l border-gray-200 flex flex-col items-center justify-center h-full p-8 text-center shrink-0">
        <div className="flex flex-col items-center max-w-sm mx-auto">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
            <Check className="w-6 h-6 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">PASS</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            No security vulnerabilities or code quality issues detected.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white border-l border-gray-200 flex flex-col h-full shrink-0">
      {/* 1. Results Header */}
      <div className="p-6 border-b border-gray-100 sticky top-0 bg-white z-10 space-y-4">
        {/* Verdict Banner */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {effectiveVerdict === 'PASS' ? (
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
            ) : effectiveVerdict === 'FAIL' ? (
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-gray-500" />
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 leading-tight">
                {effectiveVerdict}
              </h2>
              <p className={`text-xs font-medium ${
                effectiveVerdict === 'PASS' ? 'text-emerald-700' : effectiveVerdict === 'FAIL' ? 'text-red-700' : 'text-gray-600'
              }`}>
                {effectiveVerdict === 'PASS'
                  ? 'No security vulnerabilities detected.'
                  : effectiveVerdict === 'FAIL'
                    ? `${securityCount} security ${securityCount === 1 ? 'vulnerability' : 'vulnerabilities'} detected.`
                    : 'Additional context is required to verify security.'}
              </p>
            </div>
          </div>

          {totalFindings > 0 && (
            <button
              id="download-results-md-btn"
              onClick={handleDownloadMarkdown}
              className={`p-2 rounded-lg transition-all border cursor-pointer flex items-center justify-center shrink-0 ${
                isDownloaded
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-300'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300'
              }`}
              title={isDownloaded ? "Downloaded" : "Download .md"}
              aria-label="Download .md"
            >
              {isDownloaded ? <Check className="w-4 h-4 text-emerald-600" /> : <Download className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Separated Top Summary: never calls quality/style issues security vulnerabilities */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-gray-600 font-medium">Security</span>
            <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
              securityCount > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {securityCount}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-gray-600 font-medium">Quality</span>
            <span className="font-bold text-gray-800 bg-gray-200/70 px-1.5 py-0.5 rounded text-[11px]">
              {qualityCount}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-gray-600 font-medium">Best Practices</span>
            <span className="font-bold text-gray-800 bg-gray-200/70 px-1.5 py-0.5 rounded text-[11px]">
              {bpCount}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-gray-600 font-medium">Performance</span>
            <span className="font-bold text-gray-800 bg-gray-200/70 px-1.5 py-0.5 rounded text-[11px]">
              {perfCount}
            </span>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-gray-600 font-medium">Style</span>
            <span className="font-bold text-gray-800 bg-gray-200/70 px-1.5 py-0.5 rounded text-[11px]">
              {styleCount}
            </span>
          </div>
        </div>

        {/* Category Filter Tabs */}
        {totalFindings > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 custom-scrollbar text-[12px]">
            <button
              onClick={() => setActiveCategoryTab('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors shrink-0 cursor-pointer ${
                activeCategoryTab === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`}
            >
              All ({totalFindings})
            </button>
            <button
              onClick={() => setActiveCategoryTab('security')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors shrink-0 cursor-pointer ${
                activeCategoryTab === 'security'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`}
            >
              Security ({securityCount})
            </button>
            <button
              onClick={() => setActiveCategoryTab('quality')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors shrink-0 cursor-pointer ${
                activeCategoryTab === 'quality'
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`}
            >
              Quality ({qualityCount})
            </button>
            {bpCount > 0 && (
              <button
                onClick={() => setActiveCategoryTab('bestPractices')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors shrink-0 cursor-pointer ${
                  activeCategoryTab === 'bestPractices'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                Best Practices ({bpCount})
              </button>
            )}
            {perfCount > 0 && (
              <button
                onClick={() => setActiveCategoryTab('performance')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors shrink-0 cursor-pointer ${
                  activeCategoryTab === 'performance'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                Performance ({perfCount})
              </button>
            )}
            {styleCount > 0 && (
              <button
                onClick={() => setActiveCategoryTab('style')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors shrink-0 cursor-pointer ${
                  activeCategoryTab === 'style'
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                Style ({styleCount})
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. Scrollable Findings List */}
      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
        <GroupedFindingsList
          findings={displayedFindings}
          emptyMessage="No findings in this category."
        />
      </div>
    </div>
  );
}
