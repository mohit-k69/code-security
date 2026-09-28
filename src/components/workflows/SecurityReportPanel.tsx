import React, { useState, useMemo } from 'react';
import { Check, Copy, AlertTriangle, Loader2, ShieldCheck, Download, ChevronDown, ChevronRight, Bug, Sparkles, Gauge, Paintbrush, Shield, Search } from 'lucide-react';

interface SecurityReportPanelProps {
  report: any;
  isAnalyzing: boolean;
  workflow?: string;
  analysisError?: string | null;
}

/**
 * Returns the standardized category for a finding.
 */
export function getCategoryFromRule(rule: string = ''): 'security' | 'quality' | 'bestPractices' | 'performance' | 'style' {
  const r = String(rule || '').toUpperCase();
  if (r.startsWith('QUA-')) return 'quality';
  if (r.startsWith('BP-')) return 'bestPractices';
  if (r.startsWith('PERF-')) return 'performance';
  if (r.startsWith('STY-')) return 'style';
  return 'security';
}

/**
 * Derives a concrete, domain-appropriate consequence for the finding.
 * - Security: Concrete exploit scenario or attack surface impact.
 * - Quality: Maintainability and readability impact.
 * - Performance: Runtime and resource overhead impact.
 * - Best Practice: Software engineering recommendation and conventions.
 * - Style: Consistency and formatting impact.
 */
export function getRealWorldScenario(finding: any): string {
  if (finding.scenario || finding.realWorldScenario || finding.impact || finding.consequence) {
    return finding.scenario || finding.realWorldScenario || finding.impact || finding.consequence;
  }

  const category = finding.category || getCategoryFromRule(finding.rule);

  // ── 1. Code Quality Impact ───────────────────────────────────────
  if (category === 'quality') {
    const rule = String(finding.rule || '').toUpperCase();
    if (rule === 'QUA-008' || /nesting/i.test(finding.message || '')) {
      return 'Deeply nested code increases cyclomatic complexity and cognitive load, making the code harder to read, maintain, and unit test. Refactoring with early returns or helper functions improves long-term maintainability.';
    }
    if (rule === 'QUA-007' || /function is \d+ lines/i.test(finding.message || '')) {
      return 'Long functions combine multiple responsibilities, making them error-prone to modify and difficult to isolate in unit tests.';
    }
    if (rule === 'QUA-001' || /any/i.test(finding.message || '')) {
      return 'Bypassing TypeScript\'s type checker with any increases the likelihood of unhandled runtime errors and reduces editor autocomplete and type safety.';
    }
    if (rule === 'QUA-002' || /@ts-ignore/i.test(finding.message || '')) {
      return 'Suppressing type checks hides underlying type mismatches that can surface as unexpected runtime exceptions.';
    }
    if (rule === 'QUA-003' || /empty catch/i.test(finding.message || '')) {
      return 'Silently swallowing exceptions prevents proper error reporting and makes debugging production failures significantly more difficult.';
    }
    if (rule === 'QUA-004' || /\bvar\b/i.test(finding.message || '')) {
      return 'Using var introduces function-scoped hoisting, which can lead to unexpected variable shadowing and subtle state bugs compared to block-scoped let/const.';
    }
    if (rule === 'QUA-005' || /loose equality/i.test(finding.message || '')) {
      return 'Loose equality (==) performs implicit type coercion, which can produce unexpected truthy/falsy evaluation errors.';
    }
    if (rule === 'QUA-006' || /hack/i.test(finding.message || '')) {
      return 'Unresolved technical debt and temporary workarounds increase maintenance costs and often mask deeper architectural issues.';
    }
    if (rule === 'QUA-009' || /magic number/i.test(finding.message || '')) {
      return 'Magic numbers lack semantic meaning and make future adjustments error-prone because their intent and dependencies are undocumented.';
    }
    return 'This code quality issue impairs maintainability, increases cognitive overhead, and makes future refactoring and testing more difficult.';
  }

  // ── 2. Performance Impact ────────────────────────────────────────
  if (category === 'performance') {
    const rule = String(finding.rule || '').toUpperCase();
    if (rule === 'PERF-001' || /regexp/i.test(finding.message || '')) {
      return 'Recompiling regular expressions repeatedly adds CPU overhead and can cause latency spikes in performance-critical code paths.';
    }
    if (rule === 'PERF-002' || /dom query/i.test(finding.message || '')) {
      return 'Repeated direct DOM queries bypass virtual DOM caching and can trigger synchronous layout recalculations (layout thrashing).';
    }
    if (rule === 'PERF-003' || /stringify/i.test(finding.message || '')) {
      return 'Serializing and deserializing JSON for cloning is computationally expensive and drops non-JSON types (Dates, Maps, Sets, functions). Use structuredClone instead.';
    }
    if (rule === 'PERF-004' || /array mutation/i.test(finding.message || '')) {
      return 'Mutating external arrays inside forEach loops creates side-effects and is slower than declarative methods like map, filter, or reduce.';
    }
    if (rule === 'PERF-005' || /settimeout/i.test(finding.message || '')) {
      return 'Passing strings to setTimeout forces dynamic evaluation and degrades JavaScript engine optimization.';
    }
    return 'This pattern can introduce unnecessary runtime overhead, excessive memory allocation, or UI lag in high-throughput or frequently executed code paths.';
  }

  // ── 3. Best Practices Impact ─────────────────────────────────────
  if (category === 'bestPractices') {
    const rule = String(finding.rule || '').toUpperCase();
    if (rule === 'BP-001' || /console/i.test(finding.message || '')) {
      return 'Console statements left in production pollute browser/server logs, leak internal state, and can slightly degrade client rendering performance.';
    }
    if (rule === 'BP-002' || /todo|fixme/i.test(finding.message || '')) {
      return 'Unaddressed TODO or FIXME comments represent incomplete features or deferred edge cases that should be tracked in project management.';
    }
    if (rule === 'BP-003' || /debugger/i.test(finding.message || '')) {
      return 'A debugger statement pauses execution in client browsers if developer tools are open, disrupting the user experience.';
    }
    if (rule === 'BP-004' || /alert/i.test(finding.message || '')) {
      return 'Browser alert() calls block the main UI thread and prevent user interaction until dismissed. Non-blocking UI toasts or modal dialogs are recommended.';
    }
    if (rule === 'BP-005' || /then/i.test(finding.message || '')) {
      return 'Deeply chained Promise callbacks make asynchronous flow and error handling difficult to trace. Modern async/await simplifies error propagation.';
    }
    if (rule === 'BP-006' || /wildcard/i.test(finding.message || '')) {
      return 'Wildcard imports prevent bundler tree-shaking, resulting in unnecessarily inflated production bundle sizes.';
    }
    if (rule === 'BP-007' || /async/i.test(finding.message || '')) {
      return 'Declaring functions async without await introduces redundant Promise wrapping and microtask queue overhead.';
    }
    return 'Adhering to this software engineering best practice ensures idiomatic, predictable code behavior and reduces long-term technical debt.';
  }

  // ── 4. Style Impact ──────────────────────────────────────────────
  if (category === 'style') {
    const rule = String(finding.rule || '').toUpperCase();
    if (rule === 'STY-001') {
      return 'Multiple consecutive blank lines disrupt code layout and visual scanning.';
    }
    if (rule === 'STY-002') {
      return 'Mixing tabs and spaces causes inconsistent indentation across different developer environments and editors.';
    }
    if (rule === 'STY-003') {
      return 'Trailing whitespace creates unnecessary git diff churn and can lead to spurious merge conflicts.';
    }
    if (rule === 'STY-004') {
      return 'Overly long lines require horizontal scrolling and reduce code readability on split-screen monitors.';
    }
    return 'Maintaining consistent formatting and style conventions prevents unnecessary git diff noise and improves codebase readability across team members.';
  }

  // ── 5. Security Vulnerability Scenarios ───────────────────────────
  const vulnClass = String(
    finding.vulnerabilityClass ||
    finding.rule ||
    finding.criterionId ||
    ''
  ).toUpperCase().trim();

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

  if (vulnClass === 'SECRET_EXPOSURE' || vulnClass.includes('SECRET')) {
    return 'If this hardcoded secret or API key is committed to version control, anyone with access to the repository can extract the credential. An attacker could use the exposed key to perform unauthorized API calls, access private cloud services, exfiltrate data, or incur substantial unexpected billing charges.';
  }

  if (vulnClass === 'SQL_INJECTION' || vulnClass.includes('SQL')) {
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

  // Text-Based Fallback Analysis for Security Rules
  const textToAnalyze = [
    finding.title || '',
    finding.rule || '',
    finding.description || '',
    finding.message || '',
    finding.suggestion || '',
    ...(finding.cwes || []),
    ...(finding.contributingCheckpoints || [])
  ].join(' ').toLowerCase();

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

  if (
    textToAnalyze.includes('sql') ||
    (textToAnalyze.includes('injection') && textToAnalyze.includes('query')) ||
    textToAnalyze.includes('cwe-89')
  ) {
    return 'An attacker could inject malicious SQL fragments into input parameters to manipulate database queries. This allows them to bypass authentication, exfiltrate confidential database tables (including passwords and personal data), or modify and delete application records.';
  }

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

  if (
    textToAnalyze.includes('traversal') ||
    textToAnalyze.includes('cwe-22') ||
    textToAnalyze.includes('sec-file-001') ||
    textToAnalyze.includes('path_traversal')
  ) {
    return 'An attacker could supply directory traversal sequences (such as ../) in file path inputs to read or overwrite sensitive files outside the designated root directory, including server configuration files, environment variables, or application source code.';
  }

  if (
    textToAnalyze.includes('ssrf') ||
    textToAnalyze.includes('cwe-918') ||
    textToAnalyze.includes('server-side request forgery')
  ) {
    return 'An attacker could supply a malicious URL to force the server to issue requests to internal network services or cloud metadata endpoints (e.g., 169.254.169.254). This can expose internal microservices, private cluster APIs, and cloud environment credentials not accessible from the public internet.';
  }

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
 * Returns the impact section title based on finding category.
 */
export function getImpactSectionTitle(finding: any): string {
  const cat = finding.category || getCategoryFromRule(finding.rule);
  if (cat === 'quality') return 'Maintainability & Readability Impact';
  if (cat === 'performance') return 'Runtime & Resource Impact';
  if (cat === 'bestPractices') return 'Engineering Recommendation';
  if (cat === 'style') return 'Style Consistency';
  return 'Security Impact';
}

/**
 * Formats the badge label and styling according to category and severity.
 */
export function getCategoryBadge(finding: any): { label: string; className: string } {
  const cat = finding.category || getCategoryFromRule(finding.rule);
  if (cat === 'quality') {
    return { label: 'QUALITY', className: 'bg-amber-100 text-amber-800 border-amber-200' };
  }
  if (cat === 'performance') {
    return { label: 'PERFORMANCE', className: 'bg-purple-100 text-purple-800 border-purple-200' };
  }
  if (cat === 'bestPractices') {
    return { label: 'BEST PRACTICE', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
  }
  if (cat === 'style') {
    return { label: 'STYLE', className: 'bg-gray-100 text-gray-700 border-gray-200' };
  }
  // Security finding: use severity rank
  const sev = String(finding._severityLabel || finding.severity || 'HIGH').toUpperCase();
  if (sev === 'CRITICAL' || sev === 'HIGH') {
    return { label: sev === 'CRITICAL' ? 'CRITICAL' : 'HIGH', className: 'bg-red-100 text-red-800 border-red-200' };
  }
  if (sev === 'MEDIUM' || sev === 'WARNING') {
    return { label: 'MEDIUM', className: 'bg-orange-100 text-orange-800 border-orange-200' };
  }
  return { label: 'LOW', className: 'bg-blue-100 text-blue-800 border-blue-200' };
}

/**
 * Formats the issue display title combining the rule/title and file location
 */
export function getFindingDisplayTitle(finding: any): string {
  const rawTitle = finding.title || finding.rule || 'Security Finding';
  const fileName = finding.primaryLocation?.file || finding.file;
  const lineNum = finding.primaryLocation?.line || finding.line;

  if (fileName && rawTitle.includes(fileName)) {
    return rawTitle;
  }

  if (fileName) {
    return `${rawTitle}: ${fileName}${lineNum ? `:${lineNum}` : ''}`;
  }

  return rawTitle;
}

/**
 * Strips file paths, line numbers, or location suffixes from the issue title/rule
 */
export function getCleanIssueName(finding: any): string {
  let name = finding.title || finding.rule || 'Finding';
  const fileName = finding.primaryLocation?.file || finding.file;
  const lineNum = finding.primaryLocation?.line || finding.line;

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

  name = name.replace(/:\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+(?::\d+)?|\d+|line\s*\d+)\s*$/i, '').trim();

  if (lineNum && name.endsWith(`:${lineNum}`)) {
    name = name.slice(0, -(String(lineNum).length + 1)).trim();
  }

  return name || finding.title || finding.rule || 'Finding';
}

/**
 * Resolves the canonical security rule/category identifier for a finding.
 * Strips file location and line suffixes so multiple occurrences of the same rule group together.
 */
export function getFindingRule(finding: any): string {
  const raw = finding.rule || finding.ruleId || finding.criterionId || finding.vulnerabilityClass || finding.title || 'Finding';
  if (typeof raw === 'string' && raw.trim()) {
    return getCleanIssueName({ ...finding, title: raw });
  }
  return getCleanIssueName(finding);
}

/**
 * Resolves normalized severity rank and label.
 */
export function getSeverityRank(finding: any): { rank: number; label: 'HIGH' | 'MEDIUM' | 'LOW' } {
  const sev = String(finding._severityLabel || finding.severity || '').toLowerCase();
  if (sev === 'critical' || sev === 'high') {
    return { rank: 1, label: 'HIGH' };
  }
  if (sev === 'warning' || sev === 'medium') {
    return { rank: 2, label: 'MEDIUM' };
  }
  return { rank: 3, label: 'LOW' };
}

export interface FindingGroup {
  id: string;
  rule: string;
  title: string;
  category: 'security' | 'quality' | 'bestPractices' | 'performance' | 'style';
  highestSeverityRank: number;
  highestSeverityLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  commonCwe: string | null;
  allCwes: string[];
  totalOccurrences: number;
  findings: any[];
}

/**
 * Groups findings by canonical rule identifier while strictly preserving
 * every underlying individual finding and their original discovery order.
 */
export function groupFindingsByRule(findings: any[]): FindingGroup[] {
  const groups: FindingGroup[] = [];
  const groupMap = new Map<string, FindingGroup>();

  for (const finding of findings) {
    const ruleKey = getFindingRule(finding);
    const cat = finding.category || getCategoryFromRule(finding.rule);
    const mapKey = `${cat}:::${ruleKey.toLowerCase()}`;

    let group = groupMap.get(mapKey);
    if (!group) {
      const { rank, label } = getSeverityRank(finding);
      group = {
        id: mapKey,
        rule: ruleKey,
        title: getCleanIssueName(finding),
        category: cat,
        highestSeverityRank: rank,
        highestSeverityLabel: label,
        commonCwe: null,
        allCwes: [],
        totalOccurrences: 0,
        findings: [],
      };
      groupMap.set(mapKey, group);
      groups.push(group);
    }

    group.findings.push(finding);
    const count = (finding.occurrences && finding.occurrences.length > 0)
      ? finding.occurrences.length
      : (finding.count || 1);
    group.totalOccurrences += count;

    const { rank } = getSeverityRank(finding);
    if (rank < group.highestSeverityRank) {
      group.highestSeverityRank = rank;
      group.highestSeverityLabel = rank === 1 ? 'HIGH' : rank === 2 ? 'MEDIUM' : 'LOW';
    }
  }

  // Calculate common CWE across occurrences
  for (const group of groups) {
    const cweSet = new Set<string>();
    let allHaveCwe = true;
    for (const f of group.findings) {
      if (Array.isArray(f.cwes) && f.cwes.length > 0) {
        f.cwes.forEach((c: string) => cweSet.add(c));
      } else if (f.cwe) {
        cweSet.add(f.cwe);
      } else {
        allHaveCwe = false;
      }
    }
    group.allCwes = Array.from(cweSet);
    if (allHaveCwe && cweSet.size === 1) {
      group.commonCwe = Array.from(cweSet)[0];
    } else {
      group.commonCwe = null;
    }
  }

  // Stable sort: Security groups first (HIGH -> MEDIUM -> LOW), followed by quality, bestPractices, performance, style
  const categoryOrder: Record<string, number> = {
    security: 1,
    quality: 2,
    bestPractices: 3,
    performance: 4,
    style: 5,
  };

  groups.sort((a, b) => {
    const catA = categoryOrder[a.category] || 99;
    const catB = categoryOrder[b.category] || 99;
    if (catA !== catB) return catA - catB;
    if (a.highestSeverityRank !== b.highestSeverityRank) {
      return a.highestSeverityRank - b.highestSeverityRank;
    }
    return b.totalOccurrences - a.totalOccurrences;
  });

  return groups;
}

export function getGroupBadge(group: FindingGroup): { label: string; className: string } {
  if (group.category === 'quality') {
    return { label: 'QUALITY', className: 'bg-amber-100 text-amber-800 border-amber-200' };
  }
  if (group.category === 'performance') {
    return { label: 'PERFORMANCE', className: 'bg-purple-100 text-purple-800 border-purple-200' };
  }
  if (group.category === 'bestPractices') {
    return { label: 'BEST PRACTICE', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
  }
  if (group.category === 'style') {
    return { label: 'STYLE', className: 'bg-gray-100 text-gray-700 border-gray-200' };
  }
  const sev = group.highestSeverityLabel;
  if (sev === 'HIGH') {
    return { label: 'HIGH', className: 'bg-red-100 text-red-800 border-red-200' };
  }
  if (sev === 'MEDIUM') {
    return { label: 'MEDIUM', className: 'bg-orange-100 text-orange-800 border-orange-200' };
  }
  return { label: 'LOW', className: 'bg-blue-100 text-blue-800 border-blue-200' };
}

/**
 * Builds a structured, actionable prompt for an AI coding agent tailored by category.
 */
export function getCodingAgentPrompt(finding: any): string {
  const file = finding.primaryLocation?.file || finding.file || 'source file';
  const lineNum = finding.primaryLocation?.line || finding.line;
  const locationText = [
    `File: ${file}`,
    lineNum ? `Line: ${lineNum}` : null
  ].filter(Boolean).join('\n');

  const cat = finding.category || getCategoryFromRule(finding.rule);
  const title = getCleanIssueName(finding);
  const description = finding.description || finding.message || 'Issue detected in source code.';
  const scenario = getRealWorldScenario(finding);
  const snippet = finding.evidence?.[0]?.snippet || finding.snippet || finding.code;
  const suggestion = finding.suggestion || finding.remediation || 'Refactor code to resolve this issue.';

  let taskText = 'TASK\nFix the identified security vulnerability.';
  let impactHeader = 'EXPLOIT SCENARIO';
  if (cat === 'quality') {
    taskText = 'TASK\nRefactor code to resolve the identified maintainability and readability issue.';
    impactHeader = 'MAINTAINABILITY IMPACT';
  } else if (cat === 'performance') {
    taskText = 'TASK\nOptimize code to resolve the identified performance bottleneck.';
    impactHeader = 'PERFORMANCE IMPACT';
  } else if (cat === 'bestPractices') {
    taskText = 'TASK\nRefactor code according to software engineering best practices.';
    impactHeader = 'ENGINEERING RECOMMENDATION';
  } else if (cat === 'style') {
    taskText = 'TASK\nFormat code to maintain consistent style and formatting conventions.';
    impactHeader = 'STYLE CONSISTENCY';
  }

  const sections: string[] = [
    taskText,
    `LOCATION\n${locationText}`,
    `ISSUE\n${title}\n\n${description}`,
    scenario ? `${impactHeader}\n${scenario}` : '',
    snippet ? `CURRENT CODE\n${snippet}` : '',
    `REQUIRED FIX\n${suggestion}`,
    `REQUIREMENTS\n- Preserve existing application behavior.\n- Modify only what is necessary to address the issue.\n- Do not introduce new bugs or regressions.\n- Follow the existing project's coding patterns.\n- Do not modify unrelated files.`,
    `VALIDATION\n- Verify the issue is resolved.\n- Verify the application builds and tests pass.\n- Verify existing functionality is preserved.`
  ].filter(Boolean);

  return sections.join('\n\n');
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [activeCategoryTab, setActiveCategoryTab] = useState<'all' | 'security' | 'quality' | 'bestPractices' | 'performance' | 'style'>('all');
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({});
  const [expandedSubLocations, setExpandedSubLocations] = useState<Record<string, boolean>>({});

  const handleCopyPrompt = (promptText: string, key: string) => {
    navigator.clipboard.writeText(promptText);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
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

  // Group findings by canonical rule identifier while strictly preserving every underlying finding
  const displayedGroups = useMemo(() => {
    return groupFindingsByRule(displayedFindings);
  }, [displayedFindings]);

  const allGroupsExpanded = displayedGroups.length > 0 && displayedGroups.every(g => expandedGroupIds[g.id]);
  const toggleExpandAll = () => {
    if (allGroupsExpanded) {
      setExpandedGroupIds({});
    } else {
      const next: Record<string, boolean> = {};
      displayedGroups.forEach(g => {
        next[g.id] = true;
      });
      setExpandedGroupIds(next);
    }
  };

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
        {displayedGroups.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No findings in this category.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-gray-500 pb-1 px-1">
              <span>
                {displayedGroups.length} {displayedGroups.length === 1 ? 'rule group' : 'rule groups'} ({displayedFindings.length} {displayedFindings.length === 1 ? 'occurrence' : 'occurrences'})
              </span>
              <button
                type="button"
                onClick={toggleExpandAll}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
              >
                {allGroupsExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            </div>

            {displayedGroups.map((group: FindingGroup) => {
              const badge = getGroupBadge(group);
              const isSecurity = group.category === 'security';
              const isHigh = group.highestSeverityLabel === 'HIGH';
              const isMedium = group.highestSeverityLabel === 'MEDIUM';
              const isExpanded = Boolean(expandedGroupIds[group.id]);

              return (
                <div 
                  key={group.id} 
                  className={`border rounded-xl transition-all overflow-hidden ${
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
                    className="p-5 cursor-pointer hover:bg-gray-50/70 transition-colors select-none"
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
                    <div className="border-t border-gray-200 p-5 pt-4 bg-white/70 space-y-6">
                      {group.findings.map((finding: any, findingIdx: number) => {
                        const file = finding.primaryLocation?.file || finding.file || 'source';
                        const line = finding.primaryLocation?.line || finding.line;
                        const locStr = line ? `${file}:${line}` : file;
                        const snippet = finding.evidence?.[0]?.snippet || finding.snippet || finding.code;
                        const explanation = finding.description || finding.message;
                        const scenario = getRealWorldScenario(finding);
                        const impactTitle = getImpactSectionTitle(finding);
                        const suggestion = finding.suggestion || finding.remediation;
                        const agentPrompt = getCodingAgentPrompt(finding);
                        const promptKey = `${group.id}-${findingIdx}`;
                        const isCopied = copiedKey === promptKey;
                        const hasMultipleOccurrences = Boolean(finding.count && finding.count > 1);
                        const isSubLocExpanded = Boolean(expandedSubLocations[promptKey]);

                        return (
                          <div key={findingIdx} className="space-y-4">
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
                              <div className="rounded-lg bg-gray-900 p-3 overflow-x-auto">
                                <code className="text-xs font-mono text-gray-100 whitespace-pre">
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
        )}
      </div>
    </div>
  );
}
