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

  const vulnClass = String(
    finding.vulnerabilityClass ||
    finding.rule ||
    finding.criterionId ||
    ''
  ).toUpperCase().trim();

  // 1. Direct Vulnerability Class Matching
  if (vulnClass === 'JWT_SECURITY' || vulnClass.includes('JWT')) {
    return 'An attacker could forge or tamper with a JSON Web Token (e.g., modifying header parameters or payload claims such as role: admin or user IDs) and bypass authentication or authorization checks if token signatures and claims are not verified, allowing unauthorized access without possessing a legitimate signing secret.';
  }

  if (vulnClass === 'CRYPTOGRAPHIC_FAILURE' || vulnClass.includes('CRYPTO')) {
    return 'Using weak, broken, or deprecated hashing algorithms (such as MD5 or SHA-1 for passwords) allows attackers who obtain database hashes to rapidly crack and reverse them into plaintext credentials using collision attacks or precomputed rainbow tables.';
  }

  if (vulnClass === 'AUTH_BYPASS' || vulnClass === 'AUTHENTICATION_FAILURE') {
    return 'An attacker could bypass authentication controls to access restricted endpoints, administrative functions, or user accounts without presenting valid credentials. By supplying arbitrary usernames or exploiting missing credential checks, an unauthorized caller can hijack accounts or access protected services.';
  }

  if (vulnClass === 'BUSINESS_LOGIC_FLAW' || vulnClass === 'AUTHORIZATION_FAILURE' || vulnClass.includes('IDOR')) {
    return 'An authenticated attacker could manipulate object identifiers (such as record IDs in route parameters or request bodies) to view, modify, or delete another user\'s private data without authorization, bypassing tenant boundaries and ownership checks (Insecure Direct Object Reference).';
  }

  if (vulnClass === 'SECRET_EXPOSURE') {
    return 'If this hardcoded secret or API key is committed to version control, anyone with access to the repository can extract the credential. An attacker could use the exposed key to perform unauthorized API calls, access private cloud services, exfiltrate data, or incur substantial unexpected billing charges.';
  }

  if (vulnClass === 'SQL_INJECTION') {
    return 'An attacker could inject malicious SQL fragments into input parameters to manipulate database queries. This allows them to bypass authentication, exfiltrate confidential database tables (including passwords and personal data), or modify and delete application records.';
  }

  if (vulnClass === 'XSS') {
    return 'Malicious script content could execute in another user\'s browser session. This could allow an attacker to hijack active sessions by stealing cookies or localStorage tokens, capture sensitive keystrokes, deface the web application, or perform unauthorized actions on behalf of the victim.';
  }

  if (vulnClass === 'PATH_TRAVERSAL') {
    return 'An attacker could supply directory traversal sequences (such as ../) in file path inputs to read or overwrite sensitive files outside the designated root directory, including server configuration files, environment variables, or application source code.';
  }

  if (vulnClass === 'SSRF') {
    return 'An attacker could supply a malicious URL to force the server to issue requests to internal network services or cloud metadata endpoints (e.g., 169.254.169.254). This can expose internal microservices, private cluster APIs, and cloud environment credentials not accessible from the public internet.';
  }

  if (vulnClass === 'INSECURE_CONFIGURATION') {
    return 'An insecure or conflicting configuration—such as combining a wildcard CORS origin (*) with credentials enabled (Access-Control-Allow-Credentials: true) or missing critical security headers—allows untrusted third-party websites to execute authenticated cross-origin requests and steal private user data.';
  }

  if (vulnClass === 'INPUT_VALIDATION') {
    return 'An attacker could pass unvalidated or specially crafted input directly into dynamic execution sinks (such as eval() or system command spawners), potentially resulting in arbitrary remote code execution on the server or application denial of service.';
  }

  if (vulnClass === 'DEPENDENCY_RISK') {
    return 'Using outdated or compromised third-party dependencies with known security vulnerabilities (CVEs) could allow an attacker to exploit documented flaws in upstream packages to compromise the host application.';
  }

  // 2. Text-Based Fallback Analysis (with strict keyword order and protection against false positives)
  const textToAnalyze = [
    finding.title || '',
    finding.rule || '',
    finding.description || '',
    finding.message || '',
    finding.suggestion || '',
    ...(finding.cwes || []),
    ...(finding.contributingCheckpoints || [])
  ].join(' ').toLowerCase();

  // JWT & Session Security
  if (
    textToAnalyze.includes('jwt') ||
    textToAnalyze.includes('jsonwebtoken') ||
    textToAnalyze.includes('cwe-347') ||
    textToAnalyze.includes('cwe-290') ||
    textToAnalyze.includes('jwt.decode') ||
    textToAnalyze.includes('sec-session-001')
  ) {
    return 'An attacker could forge or tamper with a JSON Web Token (e.g., modifying header parameters or payload claims such as role: admin or user IDs) and bypass authentication or authorization checks if token signatures and claims are not verified, allowing unauthorized access without possessing a legitimate signing secret.';
  }

  // Cryptographic Failure & Password Hashing
  if (
    textToAnalyze.includes('md5') ||
    textToAnalyze.includes('sha1') ||
    textToAnalyze.includes('sha-1') ||
    textToAnalyze.includes('cwe-327') ||
    textToAnalyze.includes('cwe-328') ||
    textToAnalyze.includes('cwe-916') ||
    textToAnalyze.includes('hashing password') ||
    textToAnalyze.includes('password hashing') ||
    textToAnalyze.includes('weak hash') ||
    textToAnalyze.includes('sec-crypto-001')
  ) {
    return 'Using weak, broken, or deprecated hashing algorithms (such as MD5 or SHA-1 for passwords) allows attackers who obtain database hashes to rapidly crack and reverse them into plaintext credentials using collision attacks or precomputed rainbow tables.';
  }

  // Authentication Bypass
  if (
    textToAnalyze.includes('auth_bypass') ||
    textToAnalyze.includes('authentication bypass') ||
    textToAnalyze.includes('login endpoint') ||
    textToAnalyze.includes('cwe-287') ||
    textToAnalyze.includes('cwe-306') ||
    textToAnalyze.includes('sec-auth-001')
  ) {
    return 'An attacker could bypass authentication controls to access restricted endpoints, administrative functions, or user accounts without presenting valid credentials. By supplying arbitrary usernames or exploiting missing credential checks, an unauthorized caller can hijack accounts or access protected services.';
  }

  // Insecure Configuration / CORS
  if (
    textToAnalyze.includes('cors') ||
    textToAnalyze.includes('access-control-allow') ||
    textToAnalyze.includes('cwe-942') ||
    textToAnalyze.includes('sec-config-001') ||
    textToAnalyze.includes('insecure_configuration')
  ) {
    return 'An insecure or conflicting configuration—such as combining a wildcard CORS origin (*) with credentials enabled (Access-Control-Allow-Credentials: true) or missing critical security headers—allows untrusted third-party websites to execute authenticated cross-origin requests and steal private user data.';
  }

  // Authorization Failure & IDOR
  if (
    textToAnalyze.includes('idor') ||
    textToAnalyze.includes('cwe-639') ||
    textToAnalyze.includes('cwe-862') ||
    textToAnalyze.includes('cwe-863') ||
    textToAnalyze.includes('sec-authz-001') ||
    textToAnalyze.includes('business_logic_flaw') ||
    (textToAnalyze.includes('authorization') && textToAnalyze.includes('req.params'))
  ) {
    return 'An authenticated attacker could manipulate object identifiers (such as record IDs in route parameters or request bodies) to view, modify, or delete another user\'s private data without authorization, bypassing tenant boundaries and ownership checks (Insecure Direct Object Reference).';
  }

  // SQL Injection
  if (
    textToAnalyze.includes('sql') ||
    (textToAnalyze.includes('injection') && textToAnalyze.includes('query')) ||
    textToAnalyze.includes('cwe-89')
  ) {
    return 'An attacker could inject malicious SQL fragments into input parameters to manipulate database queries. This allows them to bypass authentication, exfiltrate confidential database tables (including passwords and personal data), or modify and delete application records.';
  }

  // Cross-Site Scripting (XSS)
  if (
    textToAnalyze.includes('xss') ||
    textToAnalyze.includes('cross-site scripting') ||
    textToAnalyze.includes('innerhtml') ||
    textToAnalyze.includes('dangerouslysetinnerhtml') ||
    textToAnalyze.includes('cwe-79') ||
    textToAnalyze.includes('sec-xss-001')
  ) {
    return 'Malicious script content could execute in another user\'s browser session. This could allow an attacker to hijack active sessions by stealing cookies or localStorage tokens, capture sensitive keystrokes, deface the web application, or perform unauthorized actions on behalf of the victim.';
  }

  // Path Traversal
  if (
    textToAnalyze.includes('traversal') ||
    textToAnalyze.includes('cwe-22') ||
    textToAnalyze.includes('sec-file-001') ||
    textToAnalyze.includes('path_traversal')
  ) {
    return 'An attacker could supply directory traversal sequences (such as ../) in file path inputs to read or overwrite sensitive files outside the designated root directory, including server configuration files, environment variables, or application source code.';
  }

  // SSRF
  if (
    textToAnalyze.includes('ssrf') ||
    textToAnalyze.includes('cwe-918') ||
    textToAnalyze.includes('server-side request forgery')
  ) {
    return 'An attacker could supply a malicious URL to force the server to issue requests to internal network services or cloud metadata endpoints (e.g., 169.254.169.254). This can expose internal microservices, private cluster APIs, and cloud environment credentials not accessible from the public internet.';
  }

  // Command Execution / Eval
  if (
    textToAnalyze.includes('eval(') ||
    textToAnalyze.includes('exec(') ||
    textToAnalyze.includes('spawn(') ||
    textToAnalyze.includes('command injection') ||
    textToAnalyze.includes('cwe-78') ||
    textToAnalyze.includes('cwe-94')
  ) {
    return 'An attacker could inject and execute arbitrary commands or code on the underlying server or host system, potentially gaining shell access, reading filesystem data, or pivoting into internal infrastructure.';
  }

  // Hardcoded Secret / API Key Exposure (Strict check: ensure it really is a secret exposure)
  if (
    textToAnalyze.includes('secret_exposure') ||
    textToAnalyze.includes('cwe-798') ||
    textToAnalyze.includes('cwe-259') ||
    textToAnalyze.includes('cwe-312') ||
    textToAnalyze.includes('api_key') ||
    textToAnalyze.includes('apikey') ||
    textToAnalyze.includes('hardcoded secret') ||
    textToAnalyze.includes('hardcoded api key') ||
    textToAnalyze.includes('sk_live_') ||
    textToAnalyze.includes('sec-secret-001')
  ) {
    return 'If this hardcoded secret or API key is committed to version control, anyone with access to the repository can extract the credential. An attacker could use the exposed key to perform unauthorized API calls, access private cloud services, exfiltrate data, or incur substantial unexpected billing charges.';
  }

  if (
    textToAnalyze.includes('dos') ||
    textToAnalyze.includes('denial of service') ||
    textToAnalyze.includes('redos') ||
    textToAnalyze.includes('cwe-400') ||
    textToAnalyze.includes('cwe-1333')
  ) {
    return 'Specially crafted inputs could consume excessive CPU or memory resources, causing server degradation or making the application unavailable to legitimate users.';
  }

  return 'If exploited in a production environment, this vulnerability could allow an attacker to bypass intended controls, access unauthorized data, or disrupt application operations depending on how this code path is exposed.';
}

/**
 * Formats the issue display title combining the rule/title and file location
 * e.g. "SECRET_EXPOSURE: test-vulnerability.js:4"
 */
function getFindingDisplayTitle(finding: any): string {
  const rawTitle = finding.title || finding.rule || 'Security Finding';
  const fileName = finding.primaryLocation?.file || finding.file;
  const lineNum = finding.primaryLocation?.line || finding.line;

  // If rawTitle already contains the filename, use as-is
  if (fileName && rawTitle.includes(fileName)) {
    return rawTitle;
  }

  // If fileName exists, format as "TITLE: file:line" or "TITLE: file"
  if (fileName) {
    return `${rawTitle}: ${fileName}${lineNum ? `:${lineNum}` : ''}`;
  }

  return rawTitle;
}

/**
 * Strips file paths, line numbers, or location suffixes from the issue title/rule
 * so that only the pure issue name (e.g. "SECRET_EXPOSURE") is shown without redundancy in prompts.
 */
function getCleanIssueName(finding: any): string {
  let name = finding.title || finding.rule || 'Security Finding';
  const fileName = finding.primaryLocation?.file || finding.file;
  const lineNum = finding.primaryLocation?.line || finding.line;

  // 1. If name contains fileName explicitly, strip everything from the colon or fileName onward
  if (fileName && name.includes(fileName)) {
    const idx = name.indexOf(fileName);
    let before = name.substring(0, idx).trim();
    if (before.endsWith(':')) {
      before = before.slice(0, -1).trim();
    }
    if (before) {
      return before;
    }
  }

  // 2. Remove trailing :<file>:<line> or :<file> or :<line> or : line <num>
  // e.g. "SECRET_EXPOSURE: test-vulnerability.js:4" -> "SECRET_EXPOSURE"
  // e.g. "XSS: test.js" -> "XSS"
  // e.g. "INJECTION:4" -> "INJECTION"
  // e.g. "SQL_INJECTION: line 12" -> "SQL_INJECTION"
  name = name.replace(/:\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+(?::\d+)?|\d+|line\s*\d+)\s*$/i, '').trim();

  // 3. If line number is appended like ":4" or ": 4"
  if (lineNum && name.endsWith(`:${lineNum}`)) {
    name = name.slice(0, -(String(lineNum).length + 1)).trim();
  }

  return name || finding.title || finding.rule || 'Security Finding';
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

  const title = getCleanIssueName(finding);
  const description = finding.description || finding.message || 'Vulnerability detected in the source code.';
  const scenario = getRealWorldScenario(finding);
  const snippet = finding.evidence?.[0]?.snippet || finding.snippet || finding.code;
  const suggestion = finding.suggestion || finding.remediation || 'Refactor the code according to security best practices to resolve the vulnerability.';

  const sections: string[] = [
    `TASK\nFix the identified security vulnerability.`,
    `LOCATION\n${locationText}`,
    `ISSUE\n${title}\n\n${description}`,
    scenario ? `EXPLOIT SCENARIO\n${scenario}` : '',
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

  if (report.verdict === 'PASS') {
    return (
      <div className="w-full bg-white border-l border-gray-200 flex flex-col items-center justify-center h-full p-8 text-center shrink-0">
        <div className="flex flex-col items-center max-w-sm mx-auto">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
            <Check className="w-6 h-6 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">PASS</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            No security vulnerabilities were identified in the provided code.
          </p>
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
              
              const displayTitle = getFindingDisplayTitle(finding);
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

                  {/* Issue Title with location */}
                  <h4 
                    className={`text-lg font-bold mb-3.5 ${
                      isHigh 
                        ? 'text-red-950' 
                        : isMedium 
                          ? 'text-orange-950' 
                          : 'text-blue-950'
                    }`}
                  >
                    {displayTitle}
                  </h4>

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
