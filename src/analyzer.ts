// Static code analysis engine for Cody
// Runs entirely client-side using pattern matching and heuristics

export type Severity = 'critical' | 'warning' | 'info';
export type Category = 'security' | 'quality' | 'bestPractices' | 'performance' | 'style';

export interface Occurrence {
  file?: string;
  line: number;
  snippet?: string;
}

export interface Finding {
  severity: Severity;
  category: Category;
  message: string;
  line: number;
  rule: string;
  suggestion: string;
  snippet?: string;
  file?: string;
  count?: number;
  occurrences?: Occurrence[];
}

export interface AnalysisResult {
  vibeScore: number;
  findings: Finding[];
  summary: {
    critical: number;
    warning: number;
    info: number;
  };
  securitySummary?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  categoryCounts: Record<Category, number>;
  totalLines: number;
  analyzedAt: Date;
  verdict?: 'PASS' | 'FAIL' | 'NOT_VERIFIED';
  reviewType?: string;
}

import { rules } from './lib/analyzerRules';

/**
 * Safely masks secret values in code snippets so raw credentials are never persisted or displayed.
 */
export function maskSensitiveSnippet(snippet: string): string {
  if (!snippet) return '';
  return snippet
    // Mask assignments like API_KEY = "xyz" or secret: 'xyz'
    .replace(
      /(password|passwd|pwd|secret|api_key|apikey|api[-_]?secret|token|auth[-_]?token|access[-_]?key|key)(\s*[:=]\s*['"]?)([^'"\s]{4,})(['"]?)/gi,
      (_match, p1, p2, _secret, p4) => `${p1}${p2}••••••••[REDACTED]${p4 || ''}`
    )
    // Mask URLs containing basic-auth credentials like postgres://user:pass@host
    .replace(/(:\/\/[^:]+:)([^@\s]+)(@)/gi, '$1••••••••[REDACTED]$3');
}

/**
 * Intelligently deduplicates and aggregates findings.
 * - Security findings: Each distinct issue (different rule, file, or line) is preserved so developers
 *   can remediate every vulnerability. Exact duplicates (same rule on identical file and line) are removed.
 * - Non-security findings (quality, bestPractices, performance, style):
 *   Repeated findings of the same rule (e.g. hundreds of QUA-008 deep-nesting occurrences)
 *   are aggregated into a single consolidated finding with `count` and an `occurrences` array
 *   preserving all original file, line, and snippet details.
 */
export function aggregateFindings(findings: Finding[]): Finding[] {
  const securityFindings: Finding[] = [];
  const nonSecurityMap = new Map<string, { primary: Finding; occurrences: Occurrence[] }>();
  const seenSecurityKeys = new Set<string>();

  for (const f of findings) {
    if (f.category === 'security') {
      const key = `${f.rule}-${f.file || ''}-${f.line}`;
      if (!seenSecurityKeys.has(key)) {
        seenSecurityKeys.add(key);
        const occ: Occurrence = { file: f.file, line: f.line, snippet: f.snippet };
        securityFindings.push({
          ...f,
          count: 1,
          occurrences: [occ],
        });
      }
    } else {
      // Group non-security findings by rule
      const key = f.rule;
      const occ: Occurrence = { file: f.file, line: f.line, snippet: f.snippet };
      if (!nonSecurityMap.has(key)) {
        nonSecurityMap.set(key, {
          primary: { ...f },
          occurrences: [occ],
        });
      } else {
        nonSecurityMap.get(key)!.occurrences.push(occ);
      }
    }
  }

  const aggregatedNonSecurity: Finding[] = [];
  for (const [, item] of nonSecurityMap) {
    const count = item.occurrences.length;
    const primary = {
      ...item.primary,
      count,
      occurrences: item.occurrences,
      message: count > 1 ? `${item.primary.message} (${count} occurrences)` : item.primary.message,
    };
    aggregatedNonSecurity.push(primary);
  }

  // Sort severity: critical (0) -> warning (1) -> info (2)
  const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  const all = [...securityFindings, ...aggregatedNonSecurity];
  all.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.line - b.line);

  return all;
}

// ─── Heuristic Checks (multi-line / structural) ─────────────────

function runHeuristicChecks(lines: string[], lineFileMap?: Array<{ file?: string; lineInFile: number }>): Finding[] {
  const findings: Finding[] = [];

  // Check for very long functions (>50 lines)
  let functionStartLine = -1;
  let braceDepth = 0;
  let inFunction = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fileInfo = lineFileMap ? lineFileMap[i] : undefined;
    const currentLineNum = fileInfo ? fileInfo.lineInFile : i + 1;
    const currentFile = fileInfo ? fileInfo.file : undefined;

    // Skip scaffold and manifest lines
    if (line.startsWith('// ───') || line.startsWith('// [UNTRUSTED DATA FILE:') || line.startsWith('<FILE') || line.startsWith('</FILE')) {
      continue;
    }

    if (/\b(function\s+\w+|const\s+\w+\s*=\s*(async\s+)?\(|=>\s*\{|\bdef\s+\w+)/.test(line) && !inFunction) {
      functionStartLine = i;
      inFunction = true;
      braceDepth = 0;
    }

    if (inFunction) {
      for (const ch of line) {
        if (ch === '{' || ch === '(') braceDepth++;
        if (ch === '}' || ch === ')') braceDepth--;
      }

      if (braceDepth <= 0 && i > functionStartLine) {
        const length = i - functionStartLine;
        if (length > 50) {
          const startFileInfo = lineFileMap ? lineFileMap[functionStartLine] : undefined;
          findings.push({
            severity: 'warning',
            category: 'quality',
            message: `Function is ${length} lines long — hard to maintain and test`,
            line: startFileInfo ? startFileInfo.lineInFile : functionStartLine + 1,
            rule: 'QUA-007',
            suggestion: 'Break this function into smaller, focused functions (ideally <30 lines each).',
            file: startFileInfo?.file,
          });
        }
        inFunction = false;
      }
    }

    // Deep nesting check (>6 levels)
    const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
    const nestingLevel = Math.floor(leadingSpaces / 2);
    if (nestingLevel > 6 && line.trim().length > 0) {
      findings.push({
        severity: 'warning',
        category: 'quality',
        message: `Deep nesting detected (${nestingLevel} levels) — reduces readability`,
        line: currentLineNum,
        rule: 'QUA-008',
        suggestion: 'Extract nested logic into separate functions or use early returns to flatten the structure.',
        snippet: line.trim().slice(0, 100),
        file: currentFile,
      });
    }

    // Very long lines (>150 chars)
    if (line.length > 150) {
      findings.push({
        severity: 'info',
        category: 'style',
        message: `Line is ${line.length} characters long — exceeds recommended limit`,
        line: currentLineNum,
        rule: 'STY-004',
        suggestion: 'Break long lines into multiple lines for better readability (aim for <120 chars).',
        snippet: line.trim().slice(0, 100),
        file: currentFile,
      });
    }

    // Magic numbers check
    const magicMatch = line.match(/(?<![.\w])(?<!\d)\b(\d{2,})\b(?!\s*[;,)\]}]?\s*(\/\/|\/\*|#))/);
    if (magicMatch && !/import|require|export|const\s+\w+\s*=\s*\d|let\s+\w+\s*=\s*\d|0x[\da-f]+/i.test(line) && !/(px|em|rem|vh|vw|%|rgb|hsl|#[\da-f])/i.test(line)) {
      const num = parseInt(magicMatch[1]);
      if (num > 1 && num !== 100 && num !== 1000 && ![200, 201, 204, 301, 302, 400, 401, 403, 404, 500].includes(num)) {
        findings.push({
          severity: 'info',
          category: 'quality',
          message: `Magic number ${num} — unclear meaning without context`,
          line: currentLineNum,
          rule: 'QUA-009',
          suggestion: 'Extract magic numbers into named constants (e.g., const MAX_RETRIES = 3).',
          snippet: line.trim().slice(0, 100),
          file: currentFile,
        });
      }
    }
  }

  return findings;
}

// ─── Main Analysis Function ─────────────────────────────────────

export function analyzeCode(code: string): AnalysisResult {
  const lines = code.split('\n');
  const rawFindings: Finding[] = [];
  const lineFileMap: Array<{ file?: string; lineInFile: number }> = [];

  let currentFile: string | undefined = undefined;
  let lineInFile = 0;

  // Track multi-file boundaries
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fileTagMatch = line.match(/^<FILE path="([^"]+)">/);
    if (fileTagMatch) {
      currentFile = fileTagMatch[1];
      lineInFile = 0;
      lineFileMap.push({ file: currentFile, lineInFile: 0 });
      continue;
    }
    if (line.trim() === '</FILE>') {
      currentFile = undefined;
      lineInFile = 0;
      lineFileMap.push({ file: undefined, lineInFile: 0 });
      continue;
    }

    lineInFile++;
    lineFileMap.push({ file: currentFile, lineInFile: currentFile ? lineInFile : i + 1 });
  }

  // Run pattern-based rules
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fileInfo = lineFileMap[i];
    const currentLineNum = fileInfo ? fileInfo.lineInFile : i + 1;
    const currentFile = fileInfo ? fileInfo.file : undefined;

    // Skip comment-only lines or boundary tags
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (line.startsWith('// ───') || line.startsWith('// [UNTRUSTED DATA FILE:') || line.startsWith('<FILE') || line.startsWith('</FILE')) {
      continue;
    }

    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        let snippet = trimmed.slice(0, 100);
        // Strictly mask secrets detected by SEC-003 or credential patterns
        if (rule.id === 'SEC-003' || /secret|password|key|token/i.test(rule.id)) {
          snippet = maskSensitiveSnippet(snippet);
        }

        rawFindings.push({
          severity: rule.severity,
          category: rule.category,
          message: rule.message,
          line: currentLineNum,
          rule: rule.id,
          suggestion: rule.suggestion,
          snippet,
          file: currentFile,
        });
      }
    }
  }

  // Run heuristic checks
  const heuristicFindings = runHeuristicChecks(lines, lineFileMap);
  rawFindings.push(...heuristicFindings);

  // Intelligently aggregate findings (group identical non-security findings, preserve real security findings)
  const aggregated = aggregateFindings(rawFindings);

  // Calculate separate category counts
  const categoryCounts: Record<Category, number> = {
    security: aggregated.filter(f => f.category === 'security').length,
    quality: aggregated.filter(f => f.category === 'quality').length,
    bestPractices: aggregated.filter(f => f.category === 'bestPractices').length,
    performance: aggregated.filter(f => f.category === 'performance').length,
    style: aggregated.filter(f => f.category === 'style').length,
  };

  // Severity summary across all findings
  const summary = {
    critical: aggregated.filter(f => f.severity === 'critical').length,
    warning: aggregated.filter(f => f.severity === 'warning').length,
    info: aggregated.filter(f => f.severity === 'info').length,
  };

  // Security summary (actual security findings only)
  const securityFindings = aggregated.filter(f => f.category === 'security');
  const criticalSecurity = securityFindings.filter(f => f.severity === 'critical').length;
  const warningSecurity = securityFindings.filter(f => f.severity === 'warning').length;
  const infoSecurity = securityFindings.filter(f => f.severity === 'info').length;

  const securitySummary = {
    critical: criticalSecurity,
    high: criticalSecurity,
    medium: warningSecurity,
    low: infoSecurity,
    total: securityFindings.length,
  };

  // Verdict is STRICTLY driven by security findings:
  // - Critical/High security vulnerabilities cause FAIL
  // - Medium security warnings cause NOT_VERIFIED
  // - Zero security vulnerabilities always yield PASS, regardless of quality/style issues
  const verdict: 'PASS' | 'FAIL' | 'NOT_VERIFIED' =
    criticalSecurity > 0 ? 'FAIL' : (warningSecurity > 0 ? 'NOT_VERIFIED' : 'PASS');

  // Vibe Score: starts at 100, deducted per finding severity (primarily security)
  let vibeScore = 100;
  vibeScore -= criticalSecurity * 15;
  vibeScore -= warningSecurity * 5;
  vibeScore -= categoryCounts.quality * 2;
  vibeScore -= categoryCounts.performance * 1;
  vibeScore -= categoryCounts.bestPractices * 1;
  vibeScore = Math.max(0, Math.min(100, vibeScore));

  return {
    vibeScore,
    findings: aggregated,
    summary,
    securitySummary,
    categoryCounts,
    verdict,
    totalLines: lines.length,
    analyzedAt: new Date(),
  };
}
