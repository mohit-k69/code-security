import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Check, Copy } from 'lucide-react';
import {
  FindingGroup,
  groupFindingsByRule,
  getGroupBadge,
  getRealWorldScenario,
  getImpactSectionTitle,
  getCodingAgentPrompt,
} from '../../lib/findingsGrouping';

export const CIRCLED_NUMBERS = [
  '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'
];

export interface GroupedFindingsListProps {
  findings: any[];
  title?: string;
  showSummaryHeader?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function GroupedFindingsList({
  findings,
  title,
  showSummaryHeader = true,
  emptyMessage = 'No findings in this category.',
  className = '',
}: GroupedFindingsListProps) {
  // Individual issue expansion state: keyed by `${group.id}-${findingIdx}`
  const [expandedIssueKeys, setExpandedIssueKeys] = useState<Record<string, boolean>>({});
  const [expandedSubLocations, setExpandedSubLocations] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Group findings using canonical security rule identifier while preserving 100% of underlying data
  const groups: FindingGroup[] = useMemo(() => {
    return groupFindingsByRule(findings || []);
  }, [findings]);

  const totalOccurrences = useMemo(() => {
    return groups.reduce((acc, g) => acc + g.totalOccurrences, 0);
  }, [groups]);

  const allIssuesExpanded = useMemo(() => {
    if (groups.length === 0 || totalOccurrences === 0) return false;
    return groups.every(g =>
      g.findings.every((_, fIdx) => !!expandedIssueKeys[`${g.id}-${fIdx}`])
    );
  }, [groups, totalOccurrences, expandedIssueKeys]);

  const toggleExpandAll = () => {
    if (allIssuesExpanded) {
      setExpandedIssueKeys({});
    } else {
      const next: Record<string, boolean> = {};
      groups.forEach(g => {
        g.findings.forEach((_, fIdx) => {
          next[`${g.id}-${fIdx}`] = true;
        });
      });
      setExpandedIssueKeys(next);
    }
  };

  const toggleIssue = (key: string) => {
    setExpandedIssueKeys(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleSubLocations = (key: string) => {
    setExpandedSubLocations(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleCopyPrompt = (promptText: string, key: string) => {
    navigator.clipboard.writeText(promptText);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  if (!findings || findings.length === 0) {
    return (
      <div className={`p-8 text-center text-gray-500 text-sm ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`space-y-4 text-left ${className}`}>
      {/* Summary Header */}
      {showSummaryHeader && (
        <div className="flex items-center justify-between pb-1 px-1">
          <div>
            {title && (
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                {title}
              </h3>
            )}
            <p className="text-xs text-gray-500 font-normal mt-0.5">
              {groups.length} issue {groups.length === 1 ? 'type' : 'types'} · {totalOccurrences} {totalOccurrences === 1 ? 'occurrence' : 'occurrences'}
            </p>
          </div>

          {totalOccurrences > 0 && (
            <button
              type="button"
              onClick={toggleExpandAll}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
            >
              {allIssuesExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          )}
        </div>
      )}

      {/* Category Groups List */}
      <div className="space-y-4">
        {groups.map((group: FindingGroup, catIdx: number) => {
          const badge = getGroupBadge(group);
          const catNumberStr = CIRCLED_NUMBERS[catIdx] || `${catIdx + 1}.`;

          return (
            <div
              key={group.id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs text-left"
            >
              {/* CATEGORY HEADER: Compact Row (~50-54px) acting as visual grouping header */}
              <div className="px-5 py-3 sm:py-3.5 bg-gray-50/90 border-b border-gray-200/90 flex items-center justify-between gap-3 min-h-[48px] sm:min-h-[52px]">
                {/* Left: Category number & Rule / Category name */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-base sm:text-lg font-bold text-gray-700 select-none font-mono">
                    {catNumberStr}
                  </span>
                  <span className="text-sm sm:text-base font-bold text-gray-900 font-mono tracking-tight truncate">
                    {group.rule}
                  </span>
                  {group.commonCwe && (
                    <span className="text-[10px] uppercase font-mono bg-white text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 font-medium shrink-0">
                      {group.commonCwe}
                    </span>
                  )}
                </div>

                {/* Right: Highest Severity Badge & Occurrences Count */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-md border ${badge.className}`}
                  >
                    {badge.label}
                  </span>

                  <span
                    className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-gray-200/80 text-gray-800 border border-gray-300 min-w-[24px] text-center font-mono"
                    title={`${group.totalOccurrences} occurrences`}
                  >
                    {group.totalOccurrences}
                  </span>
                </div>
              </div>

              {/* INDIVIDUAL ISSUES / OCCURRENCES: Always visible by default */}
              <div className="divide-y divide-gray-200/70">
                {group.findings.map((finding: any, occIdx: number) => {
                  const file = finding.primaryLocation?.file || finding.file;
                  const line = finding.primaryLocation?.line || finding.line;
                  const locStr = file
                    ? (line ? `${file}:${line}` : file)
                    : (finding.title || finding.rule || 'source');

                  const issueKey = `${group.id}-${occIdx}`;
                  const isIssueExpanded = Boolean(expandedIssueKeys[issueKey]);
                  const snippet = finding.evidence?.[0]?.snippet || finding.snippet || finding.code;
                  const explanation = finding.description || finding.message || 'Issue detected in source code.';
                  const scenario = getRealWorldScenario(finding);
                  const impactTitle = getImpactSectionTitle(finding);
                  const suggestion = finding.suggestion || finding.remediation;
                  const agentPrompt = getCodingAgentPrompt(finding);
                  const isCopied = copiedKey === issueKey;
                  const hasMultipleOccurrences = Boolean(finding.count && finding.count > 1);
                  const isSubLocExpanded = Boolean(expandedSubLocations[issueKey]);

                  return (
                    <div key={occIdx} className="transition-colors text-left">
                      {/* Compact Individual Issue Row (Clickable) */}
                      <button
                        type="button"
                        onClick={() => toggleIssue(issueKey)}
                        className={`w-full text-left px-5 py-3 sm:py-3.5 flex items-center justify-between gap-4 hover:bg-gray-50/80 transition-colors cursor-pointer ${
                          isIssueExpanded ? 'bg-gray-50/50' : 'bg-white'
                        }`}
                        aria-expanded={isIssueExpanded}
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <span className="text-xs sm:text-sm font-semibold text-gray-400 w-5 shrink-0 text-left font-mono">
                            {occIdx + 1}.
                          </span>
                          <span className="font-mono font-medium text-xs sm:text-sm text-gray-900 truncate">
                            {locStr}
                          </span>
                          {finding.title && finding.title !== group.rule && !finding.title.includes(locStr) && (
                            <span className="hidden sm:inline-block text-xs text-gray-500 truncate max-w-xs font-normal">
                              — {finding.title}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {finding.cwes && finding.cwes.length > 0 && !group.commonCwe && (
                            <span className="text-xs font-mono bg-gray-100 border border-gray-200 text-gray-600 px-2 py-0.5 rounded shrink-0">
                              {finding.cwes[0]}
                            </span>
                          )}
                          <div className="text-gray-400 pl-0.5">
                            {isIssueExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Expanded Issue Details: Revealed on click */}
                      {isIssueExpanded && (
                        <div className="px-5 sm:px-6 pb-6 pt-3.5 bg-gray-50/40 border-t border-gray-100 space-y-4 text-left">
                          {/* Severity Badge & CWE Tags */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            {finding.cwes && finding.cwes.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {finding.cwes.map((cwe: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="text-[10px] uppercase font-mono bg-white border border-gray-200 text-gray-700 px-2 py-0.5 rounded font-medium"
                                  >
                                    {cwe}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Problematic Code Snippet */}
                          {snippet && (
                            <div className="space-y-1.5">
                              <h6 className="text-[13px] font-bold text-gray-900 tracking-tight">
                                Code
                              </h6>
                              <div className="rounded-lg bg-gray-900 p-3.5 overflow-x-auto border border-gray-800">
                                <code className="text-xs font-mono text-gray-100 whitespace-pre block">
                                  {snippet}
                                </code>
                              </div>
                            </div>
                          )}

                          {/* Issue Explanation */}
                          {explanation && (
                            <div>
                              <h5 className="text-[14px] font-bold text-gray-900 mb-1 tracking-tight">
                                Issue
                              </h5>
                              <p className="text-gray-700 leading-relaxed text-sm">
                                {explanation}
                              </p>
                            </div>
                          )}

                          {/* Domain-Appropriate Impact */}
                          {scenario && (
                            <div className="pt-3 border-t border-gray-200/70">
                              <h5 className="text-[14px] font-bold text-gray-900 mb-1 tracking-tight">
                                {impactTitle}
                              </h5>
                              <p className="text-gray-700 leading-relaxed text-sm">
                                {scenario}
                              </p>
                            </div>
                          )}

                          {/* Remediation */}
                          {suggestion && (
                            <div className="pt-3 border-t border-gray-200/70">
                              <h5 className="text-[14px] font-bold text-gray-900 mb-1 tracking-tight">
                                Remediation
                              </h5>
                              <p className="text-gray-700 leading-relaxed text-sm">
                                {suggestion}
                              </p>
                            </div>
                          )}

                          {/* Preserved occurrences list if finding has multiple internal occurrences */}
                          {hasMultipleOccurrences && finding.occurrences && finding.occurrences.length > 1 && (
                            <div className="pt-3 border-t border-gray-200/70">
                              <button
                                type="button"
                                onClick={() => toggleSubLocations(issueKey)}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                              >
                                {isSubLocExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                <span>{isSubLocExpanded ? 'Hide' : 'View all'} {finding.occurrences.length} locations</span>
                              </button>

                              {isSubLocExpanded && (
                                <div className="mt-2 p-2.5 rounded-lg bg-white border border-gray-200 max-h-40 overflow-y-auto custom-scrollbar font-mono text-[11px] text-gray-700 space-y-1">
                                  {finding.occurrences.map((occ: any, oIdx: number) => (
                                    <div key={oIdx} className="truncate">
                                      {occ.file ? `${occ.file}:${occ.line}` : `line ${occ.line}`}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Action Prompt for Coding Agent */}
                          <div className="pt-3 border-t border-gray-200/70">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <h5 className="text-[14px] font-bold text-gray-900 tracking-tight">
                                Fix with Coding Agent
                              </h5>
                              <button
                                type="button"
                                onClick={() => handleCopyPrompt(agentPrompt, issueKey)}
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
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
