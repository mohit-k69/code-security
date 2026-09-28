/**
 * Canonical Findings Grouping & Presentation Model for Cody
 *
 * Implements canonical rule-based grouping of security findings across all views:
 * - Live Review Report Panel (Upload, Paste, GitHub)
 * - Historical Review Detail View (Reviews history)
 *
 * Invariant: Underlying individual findings are NEVER modified, lost, or merged away.
 * Grouping is strictly a presentation-layer model.
 */

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
 * Returns category from rule identifier prefix
 */
export function getCategoryFromRule(rule: string = ''): 'security' | 'quality' | 'bestPractices' | 'performance' | 'style' {
  if (rule.startsWith('QUA-')) return 'quality';
  if (rule.startsWith('BP-')) return 'bestPractices';
  if (rule.startsWith('PERF-')) return 'performance';
  if (rule.startsWith('STY-')) return 'style';
  return 'security';
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

/**
 * Groups findings by canonical rule identifier while strictly preserving
 * every underlying individual finding and their original discovery order.
 */
export function groupFindingsByRule(findings: any[]): FindingGroup[] {
  if (!findings || findings.length === 0) return [];

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
 * Returns real-world exploitation scenario or maintainability consequence
 */
export function getRealWorldScenario(finding: any): string {
  if (finding.scenario && typeof finding.scenario === 'string' && finding.scenario.trim().length > 10) {
    return finding.scenario.trim();
  }

  const cat = finding.category || getCategoryFromRule(finding.rule);

  if (cat === 'quality') {
    const rule = finding.rule || '';
    if (rule === 'QUA-008') {
      return 'Deep control flow nesting increases cyclomatic complexity, making future logic modifications error-prone and hiding edge-case bugs during code reviews.';
    }
    if (rule === 'QUA-001') {
      return 'Long functions with multiple responsibilities become difficult to test comprehensively, increasing the risk of unintended side-effects during refactoring.';
    }
    return 'Overly complex or non-modular code impedes comprehension and raises maintenance overhead across engineering teams.';
  }

  if (cat === 'performance') {
    return 'Unoptimized loops, redundant allocations, or synchronous operations can degrade application responsiveness and cause severe latency spikes under production workloads.';
  }

  if (cat === 'bestPractices') {
    return 'Deviations from standard software engineering conventions degrade long-term codebase health and increase debugging time for team members.';
  }

  if (cat === 'style') {
    return 'Inconsistent code formatting and naming patterns reduce developer velocity and make diff inspection during pull requests noisier.';
  }

  const textToAnalyze = [
    finding.title || '',
    finding.rule || '',
    finding.description || '',
    finding.message || '',
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
