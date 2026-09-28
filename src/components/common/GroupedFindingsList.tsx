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
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});
  const [expandedSubLocations, setExpandedSubLocations] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Group findings using canonical security rule identifier while preserving 100% of underlying data
  const groups: FindingGroup[] = useMemo(() => {
    return groupFindingsByRule(findings || []);
  }, [findings]);

  const totalOccurrences = useMemo(() => {
    return groups.reduce((acc, g) => acc + g.totalOccurrences, 0);
  }, [groups]);

  const allGroupsExpanded = groups.length > 0 && groups.every(g => !!expandedGroupIds[g.id]);

  const toggleExpandAll = () => {
    if (allGroupsExpanded) {
      setExpandedGroupIds({});
    } else {
      const next: Record<string, boolean> = {};
      groups.forEach(g => {
        next[g.id] = true;
      });
      setExpandedGroupIds(next);
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroupIds(prev => ({
      ...prev,
      [groupId]: !prev[groupId],
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

          {groups.length > 0 && (
            <button
              type="button"
              onClick={toggleExpandAll}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
            >
              {allGroupsExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          )}
        </div>
      )}

      {/* Grouped Findings List */}
      <div className="space-y-4">
        {groups.map((group: FindingGroup) => {
          const badge = getGroupBadge(group);
          const isSecurity = group.category === 'security';
          const isHigh = group.highestSeverityLabel === 'HIGH';
          const isMedium = group.highestSeverityLabel === 'MEDIUM';
          const isExpanded = Boolean(expandedGroupIds[group.id]);

          return (
            <div
              key={group.id}
              className={`border rounded-xl transition-all overflow-hidden text-left ${
                isSecurity && isHigh
                  ? 'border-red-200 bg-red-50/10'
                  : isSecurity && isMedium
                    ? 'border-orange-200 bg-orange-50/10'
                    : group.category === 'quality'
                      ? 'border-amber-200 bg-amber-50/10'
                      : group.category === 'bestPractices'
                        ? 'border-indigo-200 bg-indigo-50/10'
                        : group.category === 'performance'
                          ? 'border-purple-200 bg-purple-50/10'
                          : 'border-gray-200 bg-white'
              }`}
            >
              {/* TOP-LEVEL GROUP ROW (Clickable) */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={() => toggleGroup(group.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleGroup(group.id);
                  }
                }}
                className="p-5 cursor-pointer hover:bg-gray-50/70 transition-colors select-none text-left"
              >
                <div className="flex items-center justify-between gap-4">
                  {/* Left: Rule / Category */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-bold text-gray-900 tracking-tight font-mono sm:font-sans">
                          {group.rule}
                        </span>
                        {group.commonCwe && (
                          <span className="text-[10px] uppercase font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                            {group.commonCwe}
                          </span>
                        )}
                      </div>
                      {group.title && group.title !== group.rule && (
                        <p className="text-xs text-gray-500 font-normal mt-0.5 truncate">
                          {group.title}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {group.totalOccurrences} {group.totalOccurrences === 1 ? 'occurrence' : 'occurrences'}
                      </p>
                    </div>
                  </div>

                  {/* Right: Severity Badge, Count Badge, Chevron */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-md border ${badge.className}`}
                    >
                      {badge.label}
                    </span>

                    <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-800 border border-gray-200 min-w-[28px] text-center">
                      {group.totalOccurrences}
                    </span>

                    <div className="text-gray-400 group-hover:text-gray-600 transition-colors">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* EXPANDED SECTION: ALL UNDERLYING OCCURRENCES */}
              {isExpanded && (
                <div className="border-t border-gray-200 p-5 pt-4 bg-white/70 space-y-6 text-left">
                  {group.findings.map((finding: any, findingIdx: number) => {
                    const file = finding.primaryLocation?.file || finding.file || 'source';
                    const line = finding.primaryLocation?.line || finding.line;
                    const locStr = line ? `${file}:${line}` : file;
                    const snippet = finding.evidence?.[0]?.snippet || finding.snippet || finding.code;
                    const explanation = finding.description || finding.message || 'Issue detected in source code.';
                    const scenario = getRealWorldScenario(finding);
                    const impactTitle = getImpactSectionTitle(finding);
                    const suggestion = finding.suggestion || finding.remediation;
                    const agentPrompt = getCodingAgentPrompt(finding);
                    const promptKey = `${group.id}-${findingIdx}`;
                    const isCopied = copiedKey === promptKey;
                    const hasMultipleOccurrences = Boolean(finding.count && finding.count > 1);
                    const isSubLocExpanded = Boolean(expandedSubLocations[promptKey]);

                    return (
                      <div key={findingIdx} className="space-y-4 text-left">
                        {/* 1. Location Header */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-400 font-mono">
                              {findingIdx + 1}.
                            </span>
                            <span className="text-sm font-bold font-mono text-gray-900 bg-gray-100/90 px-2 py-0.5 rounded border border-gray-200">
                              {locStr}
                            </span>
                          </div>
                          {finding.cwes && finding.cwes.length > 0 && !group.commonCwe && (
                            <div className="flex flex-wrap gap-1">
                              {finding.cwes.map((cwe: string, idx: number) => (
                                <span key={idx} className="text-[10px] uppercase font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                                  {cwe}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 2. Problematic Code Snippet */}
                        {snippet && (
                          <div className="rounded-lg bg-gray-900 p-3 overflow-x-auto border border-gray-800">
                            <code className="text-xs font-mono text-gray-100 whitespace-pre block">
                              {snippet}
                            </code>
                          </div>
                        )}

                        {/* 3. Issue */}
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

                        {/* 4. Security Impact */}
                        {scenario && (
                          <div className="pt-3 border-t border-gray-100">
                            <h5 className="text-[14px] font-bold text-gray-900 mb-1 tracking-tight">
                              {impactTitle}
                            </h5>
                            <p className="text-gray-700 leading-relaxed text-sm">
                              {scenario}
                            </p>
                          </div>
                        )}

                        {/* 5. Remediation */}
                        {suggestion && (
                          <div className="pt-3 border-t border-gray-100">
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
                          <div className="pt-3 border-t border-gray-100">
                            <button
                              type="button"
                              onClick={() => toggleSubLocations(promptKey)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                            >
                              {isSubLocExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              <span>{isSubLocExpanded ? 'Hide' : 'View all'} {finding.occurrences.length} locations</span>
                            </button>

                            {isSubLocExpanded && (
                              <div className="mt-2 p-2.5 rounded-lg bg-gray-50 border border-gray-200 max-h-40 overflow-y-auto custom-scrollbar font-mono text-[11px] text-gray-700 space-y-1">
                                {finding.occurrences.map((occ: any, occIdx: number) => (
                                  <div key={occIdx} className="truncate">
                                    {occ.file ? `${occ.file}:${occ.line}` : `line ${occ.line}`}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 6. Action Prompt for Coding Agent */}
                        <div className="pt-3 border-t border-gray-100">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h5 className="text-[14px] font-bold text-gray-900 tracking-tight">
                              Fix with Coding Agent
                            </h5>
                            <button
                              type="button"
                              onClick={() => handleCopyPrompt(agentPrompt, promptKey)}
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

                        {/* Divider between occurrences within the group */}
                        {findingIdx < group.findings.length - 1 && (
                          <div className="border-t border-gray-200 my-4" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
