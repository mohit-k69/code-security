// Static code analysis engine for Code Vibe
// Runs entirely client-side using pattern matching and heuristics

export type Severity = 'critical' | 'warning' | 'info';
export type Category = 'security' | 'quality' | 'bestPractices' | 'performance' | 'style';

export interface Finding {
  severity: Severity;
  category: Category;
  message: string;
  line: number;
  rule: string;
  suggestion: string;
  snippet?: string;
}

export interface AnalysisResult {
  vibeScore: number;
  findings: Finding[];
  summary: {
    critical: number;
    warning: number;
    info: number;
  };
  categoryCounts: Record<Category, number>;
  totalLines: number;
  analyzedAt: Date;
  verdict?: string;
}

import { rules } from './lib/analyzerRules';

// ─── Heuristic Checks (multi-line / structural) ─────────────────

function runHeuristicChecks(lines: string[]): Finding[] {
  const findings: Finding[] = [];

  // Check for very long functions (>50 lines)
  let functionStartLine = -1;
  let braceDepth = 0;
  let inFunction = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

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
          findings.push({
            severity: 'warning',
            category: 'quality',
            message: `Function is ${length} lines long — hard to maintain and test`,
            line: functionStartLine + 1,
            rule: 'QUA-007',
            suggestion: 'Break this function into smaller, focused functions (ideally <30 lines each).',
          });
        }
        inFunction = false;
      }
    }

    // Deep nesting check (>4 levels)
    const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
    const nestingLevel = Math.floor(leadingSpaces / 2);
    if (nestingLevel > 6 && line.trim().length > 0) {
      findings.push({
        severity: 'warning',
        category: 'quality',
        message: `Deep nesting detected (${nestingLevel} levels) — reduces readability`,
        line: i + 1,
        rule: 'QUA-008',
        suggestion: 'Extract nested logic into separate functions or use early returns to flatten the structure.',
      });
    }

    // Very long lines (>120 chars)
    if (line.length > 150) {
      findings.push({
        severity: 'info',
        category: 'style',
        message: `Line is ${line.length} characters long — exceeds recommended limit`,
        line: i + 1,
        rule: 'STY-004',
        suggestion: 'Break long lines into multiple lines for better readability (aim for <120 chars).',
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
          line: i + 1,
          rule: 'QUA-009',
          suggestion: 'Extract magic numbers into named constants (e.g., const MAX_RETRIES = 3).',
        });
      }
    }
  }

  return findings;
}

// ─── Main Analysis Function ─────────────────────────────────────

export function analyzeCode(code: string): AnalysisResult {
  const lines = code.split('\n');
  const findings: Finding[] = [];

  // Run pattern-based rules
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines for some rules
    const trimmed = line.trim();
    if (trimmed === '') continue;

    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        // Avoid duplicate findings on the same line for the same rule
        const alreadyFound = findings.some(f => f.rule === rule.id && f.line === i + 1);
        if (!alreadyFound) {
          findings.push({
            severity: rule.severity,
            category: rule.category,
            message: rule.message,
            line: i + 1,
            rule: rule.id,
            suggestion: rule.suggestion,
            snippet: trimmed.slice(0, 100),
          });
        }
      }
    }
  }

  // Run heuristic checks
  const heuristicFindings = runHeuristicChecks(lines);
  findings.push(...heuristicFindings);

  // Deduplicate heuristic findings by line + rule
  const seen = new Set<string>();
  const deduped = findings.filter(f => {
    const key = `${f.rule}-${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by severity then line
  const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  deduped.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.line - b.line);

  // Calculate summary
  const summary = {
    critical: deduped.filter(f => f.severity === 'critical').length,
    warning: deduped.filter(f => f.severity === 'warning').length,
    info: deduped.filter(f => f.severity === 'info').length,
  };

  // Category counts
  const categoryCounts: Record<Category, number> = {
    security: deduped.filter(f => f.category === 'security').length,
    quality: deduped.filter(f => f.category === 'quality').length,
    bestPractices: deduped.filter(f => f.category === 'bestPractices').length,
    performance: deduped.filter(f => f.category === 'performance').length,
    style: deduped.filter(f => f.category === 'style').length,
  };

  // Vibe Score: starts at 100, deducted per finding severity
  let vibeScore = 100;
  vibeScore -= summary.critical * 15;
  vibeScore -= summary.warning * 5;
  vibeScore -= summary.info * 1;
  vibeScore = Math.max(0, Math.min(100, vibeScore));

  return {
    vibeScore,
    findings: deduped,
    summary,
    categoryCounts,
    totalLines: lines.length,
    analyzedAt: new Date(),
  };
}
