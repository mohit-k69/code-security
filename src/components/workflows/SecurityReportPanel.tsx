import React, { useState } from 'react';
import { Check, Copy, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';

interface SecurityReportPanelProps {
  report: any;
  isAnalyzing: boolean;
}

/**
 * Derives a concrete, practical consequence of the vulnerability in simple developer-friendly terms.
 */
function getRealWorldScenario(finding: any): string {
  if (finding.scenario || finding.realWorldScenario || finding.impact || finding.consequence) {
    return finding.scenario || finding.realWorldScenario || finding.impact || finding.consequence;
  }

  const textToAnalyze = [
    finding.title || '',
    finding.rule || '',
    finding.description || '',
    ...(finding.cwes || [])
  ].join(' ').toLowerCase();

  if (
    textToAnalyze.includes('secret') ||
    textToAnalyze.includes('api_key') ||
    textToAnalyze.includes('apikey') ||
    textToAnalyze.includes('api key') ||
    textToAnalyze.includes('token') ||
    textToAnalyze.includes('password') ||
    textToAnalyze.includes('credential') ||
    textToAnalyze.includes('cwe-798') ||
    textToAnalyze.includes('cwe-259') ||
    textToAnalyze.includes('cwe-312')
  ) {
    return 'If this secret or API key is committed to a public or compromised repository, an attacker could copy it and use the API under your account. If the key allows billable requests or privileged actions, they could generate thousands of requests, leave you with an unexpected bill, or access protected user data.';
  }

  if (
    textToAnalyze.includes('sql') ||
    textToAnalyze.includes('injection') && textToAnalyze.includes('query') ||
    textToAnalyze.includes('cwe-89')
  ) {
    return 'An attacker could supply crafted inputs to manipulate database queries, allowing them to bypass authentication, read confidential database tables, or modify and delete application records.';
  }

  if (
    textToAnalyze.includes('xss') ||
    textToAnalyze.includes('cross-site scripting') ||
    textToAnalyze.includes('innerhtml') ||
    textToAnalyze.includes('dangerouslysetinnerhtml') ||
    textToAnalyze.includes('cwe-79')
  ) {
    return "Malicious script content could execute in another user's browser session. Depending on the application's protections, this could allow an attacker to steal session cookies, capture keystrokes, or perform unauthorized actions on that user's behalf.";
  }

  if (
    textToAnalyze.includes('command') ||
    textToAnalyze.includes('exec') ||
    textToAnalyze.includes('spawn') ||
    textToAnalyze.includes('eval') ||
    textToAnalyze.includes('cwe-78') ||
    textToAnalyze.includes('cwe-94')
  ) {
    return 'An attacker could inject and execute arbitrary commands on the underlying server or host system, potentially gaining shell access, reading filesystem data, or pivoting into internal infrastructure.';
  }

  if (
    textToAnalyze.includes('traversal') ||
    textToAnalyze.includes('path') ||
    textToAnalyze.includes('cwe-22')
  ) {
    return 'An attacker could supply directory traversal sequences (like ../) to read or overwrite files outside the intended folder, such as server configuration files or sensitive source code.';
  }

  if (
    textToAnalyze.includes('auth') ||
    textToAnalyze.includes('bypass') ||
    textToAnalyze.includes('access control') ||
    textToAnalyze.includes('idor') ||
    textToAnalyze.includes('cwe-287') ||
    textToAnalyze.includes('cwe-306') ||
    textToAnalyze.includes('cwe-862') ||
    textToAnalyze.includes('cwe-639')
  ) {
    return 'An attacker could potentially access restricted features, administrative endpoints, or private account data without completing the intended authentication or authorization checks.';
  }

  if (
    textToAnalyze.includes('ssrf') ||
    textToAnalyze.includes('cwe-918')
  ) {
    return 'An attacker could force the server to issue requests to internal networks or cloud metadata services (e.g., 169.254.169.254), exposing internal services or cloud credentials.';
  }

  if (
    textToAnalyze.includes('crypto') ||
    textToAnalyze.includes('hash') ||
    textToAnalyze.includes('md5') ||
    textToAnalyze.includes('sha1') ||
    textToAnalyze.includes('cwe-327') ||
    textToAnalyze.includes('cwe-328')
  ) {
    return 'Weak cryptographic algorithms or insufficient key sizes make encrypted payloads and hashed passwords susceptible to pre-computed lookup attacks and collision cracking.';
  }

  if (
    textToAnalyze.includes('dos') ||
    textToAnalyze.includes('denial') ||
    textToAnalyze.includes('redos') ||
    textToAnalyze.includes('cwe-400') ||
    textToAnalyze.includes('cwe-1333')
  ) {
    return 'Specially crafted inputs could consume excessive CPU or memory resources, causing server degradation or making the application unavailable to legitimate users.';
  }

  return 'If exploited in a production environment, this vulnerability could allow an attacker to bypass intended controls, access unauthorized data, or disrupt application operations depending on how this code path is exposed.';
}

/**
 * Builds a structured, concise, and actionable prompt for an AI coding agent.
 */
function getCodingAgentPrompt(finding: any): string {
  const file = finding.primaryLocation?.file || finding.file || 'source file';
  const lineNum = finding.primaryLocation?.line || finding.line;
  const locationText = [
    `File: ${file}`,
    lineNum ? `Line: ${lineNum}` : null
  ].filter(Boolean).join('\n');

  const title = finding.title || finding.rule || 'Security Vulnerability';
  const description = finding.description || finding.message || 'Vulnerability detected in the source code.';
  const snippet = finding.evidence?.[0]?.snippet || finding.snippet || finding.code;
  const suggestion = finding.suggestion || finding.remediation || 'Refactor the code according to security best practices to resolve the vulnerability.';

  const sections: string[] = [
    `TASK\nFix the identified security vulnerability.`,
    `LOCATION\n${locationText}`,
    `ISSUE\n${title}\n\n${description}`,
    snippet ? `CURRENT CODE\n${snippet}` : '',
    `REQUIRED FIX\n${suggestion}`,
    `REQUIREMENTS\n- Preserve existing application behavior.\n- Modify only what is necessary to fix the vulnerability.\n- Do not introduce new security issues.\n- Follow the existing project's coding patterns.\n- Do not modify unrelated files unless required by the fix.`,
    `VALIDATION\n- Verify the vulnerability is resolved.\n- Verify the application still compiles/builds.\n- Verify existing functionality is preserved.`
  ].filter(Boolean);

  return sections.join('\n\n');
}

export function SecurityReportPanel({ report, isAnalyzing }: SecurityReportPanelProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyPrompt = (promptText: string, index: number) => {
    navigator.clipboard.writeText(promptText);
    setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  if (isAnalyzing) {
    return (
      <div className="w-full bg-white border-l border-gray-200 flex flex-col items-center justify-center h-full p-8 text-center shrink-0">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <h3 className="text-gray-900 font-medium text-lg">Running Security Analysis...</h3>
        <p className="text-gray-500 text-sm mt-2">Checking your code against our security checkpoints.</p>
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
      return { ...f, _severityRank: rank, _severityLabel: label };
    });
  } else if (report.findings) {
    const criticalList = (report.findings?.critical || []).map((f: any) => ({ ...f, _severityRank: 1, _severityLabel: 'HIGH' as const }));
    const warningList = (report.findings?.warning || []).map((f: any) => ({ ...f, _severityRank: 2, _severityLabel: 'MEDIUM' as const }));
    const infoList = (report.findings?.info || []).map((f: any) => ({ ...f, _severityRank: 3, _severityLabel: 'LOW' as const }));
    allFindings = [...criticalList, ...warningList, ...infoList];
  }

  // Stable sort: HIGH (1) -> MEDIUM (2) -> LOW (3), preserving original relative order for identical severity
  allFindings.sort((a, b) => a._severityRank - b._severityRank);

  const totalFindings = allFindings.length;

  return (
    <div className="w-full bg-white border-l border-gray-200 flex flex-col h-full shrink-0">
      {/* 1. Results Header */}
      <div className="p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
        {report.verdict === 'PASS' && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">PASS</h2>
            </div>
            <p className="text-gray-600">No security vulnerabilities were identified in the provided code.</p>
          </div>
        )}

        {report.verdict === 'NOT_VERIFIED' && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-gray-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">NOT VERIFIED</h2>
            </div>
            <p className="text-gray-600">Security could not be confidently verified because additional context is required.</p>
            <p className="text-gray-500 text-sm mt-2 italic">Add the related implementation or supporting files and run the analysis again.</p>
          </div>
        )}

        {report.verdict === 'FAIL' && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">FAIL</h2>
            </div>
            <p className="text-red-700 font-medium">Security vulnerabilities were detected in the provided code.</p>
            
            <div className="mt-3">
              <span className="font-semibold text-gray-800 text-sm">
                {totalFindings} security {totalFindings === 1 ? 'vulnerability' : 'vulnerabilities'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Scrollable Findings List */}
      <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
        {report.verdict === 'FAIL' && totalFindings > 0 && (
          <div className="space-y-6">
            {allFindings.map((finding: any, i: number) => {
              const isHigh = finding._severityLabel === 'HIGH';
              const isMedium = finding._severityLabel === 'MEDIUM';
              
              const issueName = finding.title || finding.rule || 'Security Finding';
              const fileName = finding.primaryLocation?.file || finding.file;
              const lineNum = finding.primaryLocation?.line || finding.line;
              const snippet = finding.evidence?.[0]?.snippet || finding.snippet || finding.code;
              const explanation = finding.description || finding.message;
              const scenario = getRealWorldScenario(finding);
              const agentPrompt = getCodingAgentPrompt(finding);
              const isCopied = copiedIndex === i;

              return (
                <div 
                  key={i} 
                  className={`border rounded-xl p-5 ${
                    isHigh 
                      ? 'border-red-200 bg-red-50/10' 
                      : isMedium 
                        ? 'border-orange-200 bg-orange-50/10' 
                        : 'border-blue-200 bg-blue-50/10'
                  }`}
                >
                  {/* Severity Badge */}
                  <div className="mb-2.5">
                    <span 
                      className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-md ${
                        isHigh 
                          ? 'bg-red-100 text-red-800' 
                          : isMedium 
                            ? 'bg-orange-100 text-orange-800' 
                            : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {finding._severityLabel}
                    </span>
                  </div>

                  {/* A. Issue Name */}
                  <h4 
                    className={`text-lg font-bold mb-1 ${
                      isHigh 
                        ? 'text-red-950' 
                        : isMedium 
                          ? 'text-orange-950' 
                          : 'text-blue-950'
                    }`}
                  >
                    {issueName}
                  </h4>
                  
                  {/* B. Location */}
                  {(fileName || lineNum) && (
                    <p className="text-xs font-medium text-gray-500 mb-3.5">
                      {fileName ? fileName : 'Source'} {lineNum ? `· Line ${lineNum}` : ''}
                    </p>
                  )}

                  {/* C. Exact Problematic Code */}
                  {snippet && (
                    <div className="rounded-lg bg-gray-900 p-3 mb-4 overflow-x-auto">
                      <code className="text-xs font-mono text-gray-100 whitespace-pre">
                        {snippet}
                      </code>
                    </div>
                  )}
                  
                  {/* D. Issue */}
                  {explanation && (
                    <div className="mb-4">
                      <h5 className="text-[17px] font-bold text-gray-900 mb-1.5 tracking-tight">
                        Issue
                      </h5>
                      <p className="text-gray-700 leading-relaxed text-sm">
                        {explanation}
                      </p>
                    </div>
                  )}

                  {/* E. Scenario */}
                  <div className="mb-4 pt-3 border-t border-gray-100">
                    <h5 className="text-[17px] font-bold text-gray-900 mb-1.5 tracking-tight">
                      Scenario
                    </h5>
                    <p className="text-gray-700 leading-relaxed text-sm">
                      {scenario}
                    </p>
                  </div>

                  {/* F. Fix with Coding Agent */}
                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h5 className="text-[17px] font-bold text-gray-900 tracking-tight">
                        Fix with Coding Agent
                      </h5>
                      <button
                        onClick={() => handleCopyPrompt(agentPrompt, i)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
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

                  {/* CWE metadata if present */}
                  {finding.cwes && finding.cwes.length > 0 && (
                    <div className="mt-3.5 pt-2 flex flex-wrap gap-1.5">
                      {finding.cwes.map((cwe: string, idx: number) => (
                        <span key={idx} className="text-[10px] uppercase font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {cwe}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
