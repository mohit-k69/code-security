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
}

// ─── Rule Definitions ──────────────────────────────────────────────

interface Rule {
  id: string;
  pattern: RegExp;
  severity: Severity;
  category: Category;
  message: string;
  suggestion: string;
}

const rules: Rule[] = [
  // ── Security Rules ────────────────────────────────────────────
  {
    id: 'SEC-001',
    pattern: /\beval\s*\(/,
    severity: 'critical',
    category: 'security',
    message: 'Use of eval() detected — allows arbitrary code execution',
    suggestion: 'Replace eval() with JSON.parse(), Function constructor, or a safer alternative.',
  },
  {
    id: 'SEC-002',
    pattern: /\.(innerHTML|outerHTML)\s*=/,
    severity: 'critical',
    category: 'security',
    message: 'Direct innerHTML assignment — potential XSS vulnerability',
    suggestion: 'Use textContent, createElement, or a sanitization library like DOMPurify.',
  },
  {
    id: 'SEC-003',
    pattern: /(password|passwd|pwd|secret|api_key|apikey|api[-_]?secret|token|auth[-_]?token|access[-_]?key)\s*[:=]\s*['"][^'"]{4,}['"]/i,
    severity: 'critical',
    category: 'security',
    message: 'Possible hardcoded secret or credential',
    suggestion: 'Move secrets to environment variables or a secrets manager. Never commit credentials.',
  },
  {
    id: 'SEC-004',
    pattern: /dangerouslySetInnerHTML/,
    severity: 'critical',
    category: 'security',
    message: 'dangerouslySetInnerHTML used — XSS risk in React',
    suggestion: 'Sanitize HTML with DOMPurify before injecting, or use safer rendering approaches.',
  },
  {
    id: 'SEC-005',
    pattern: /new\s+Function\s*\(/,
    severity: 'warning',
    category: 'security',
    message: 'Dynamic Function constructor — similar risks to eval()',
    suggestion: 'Avoid constructing functions from strings. Use static function definitions.',
  },
  {
    id: 'SEC-006',
    pattern: /document\.write\s*\(/,
    severity: 'warning',
    category: 'security',
    message: 'document.write() can overwrite the entire page and is an XSS vector',
    suggestion: 'Use DOM manipulation methods like appendChild or insertAdjacentHTML.',
  },
  {
    id: 'SEC-007',
    pattern: /\bexec\s*\(|child_process|subprocess|os\.system|os\.popen/,
    severity: 'critical',
    category: 'security',
    message: 'Command execution detected — potential command injection risk',
    suggestion: 'Validate and sanitize all inputs. Use parameterized APIs instead of shell commands.',
  },
  {
    id: 'SEC-008',
    pattern: /http:\/\/(?!localhost|127\.0\.0\.1)/,
    severity: 'warning',
    category: 'security',
    message: 'Insecure HTTP URL detected (should use HTTPS)',
    suggestion: 'Use HTTPS for all external connections to prevent man-in-the-middle attacks.',
  },
  {
    id: 'SEC-009',
    pattern: /SELECT\s+.*\s+FROM\s+.*\+\s*['"]?\s*\+|f['"]SELECT|['"]SELECT.*\{/i,
    severity: 'critical',
    category: 'security',
    message: 'Potential SQL injection — string concatenation in query',
    suggestion: 'Use parameterized queries or prepared statements instead of string concatenation.',
  },
  {
    id: 'SEC-010',
    pattern: /crypto\.createHash\s*\(\s*['"]md5['"]\s*\)|hashlib\.md5/,
    severity: 'warning',
    category: 'security',
    message: 'Weak hash algorithm (MD5) detected',
    suggestion: 'Use SHA-256 or stronger hashing algorithms. MD5 is cryptographically broken.',
  },

  // ── Code Quality Rules ────────────────────────────────────────
  {
    id: 'QUA-001',
    pattern: /:\s*any\b/,
    severity: 'warning',
    category: 'quality',
    message: 'TypeScript `any` type usage — bypasses type safety',
    suggestion: 'Use a specific type, `unknown`, or a generic type parameter instead of `any`.',
  },
  {
    id: 'QUA-002',
    pattern: /\/\/\s*@ts-ignore/,
    severity: 'warning',
    category: 'quality',
    message: '@ts-ignore suppresses TypeScript errors',
    suggestion: 'Fix the underlying type error instead of suppressing it. Use @ts-expect-error if needed.',
  },
  {
    id: 'QUA-003',
    pattern: /\bcatch\s*\(\s*\w*\s*\)\s*\{\s*\}/,
    severity: 'warning',
    category: 'quality',
    message: 'Empty catch block — errors are silently swallowed',
    suggestion: 'Log the error, rethrow, or handle it explicitly. Empty catch blocks hide bugs.',
  },
  {
    id: 'QUA-004',
    pattern: /\b(var)\s+\w/,
    severity: 'info',
    category: 'quality',
    message: '`var` declaration used — function-scoped, not block-scoped',
    suggestion: 'Use `let` or `const` instead of `var` for predictable scoping.',
  },
  {
    id: 'QUA-005',
    pattern: /==(?!=)|!=(?!=)/,
    severity: 'info',
    category: 'quality',
    message: 'Loose equality operator — may cause unexpected type coercion',
    suggestion: 'Use strict equality (=== or !==) to avoid implicit type conversion.',
  },
  {
    id: 'QUA-006',
    pattern: /^\s*\/\/.*\bhack\b/i,
    severity: 'warning',
    category: 'quality',
    message: 'Comment mentions a "hack" — indicates technical debt',
    suggestion: 'Refactor to a proper solution and remove the hack.',
  },

  // ── Best Practices Rules ──────────────────────────────────────
  {
    id: 'BP-001',
    pattern: /console\.(log|debug|info|warn|error|trace)\s*\(/,
    severity: 'info',
    category: 'bestPractices',
    message: 'Console statement left in code',
    suggestion: 'Remove console statements before production or use a proper logging library.',
  },
  {
    id: 'BP-002',
    pattern: /\/\/\s*(TODO|FIXME|HACK|XXX|BUG)\b/i,
    severity: 'info',
    category: 'bestPractices',
    message: 'TODO/FIXME comment found — unfinished work',
    suggestion: 'Track these items in your issue tracker and resolve them before merging.',
  },
  {
    id: 'BP-003',
    pattern: /debugger\b/,
    severity: 'warning',
    category: 'bestPractices',
    message: '`debugger` statement found — will pause execution in browser',
    suggestion: 'Remove debugger statements before committing code.',
  },
  {
    id: 'BP-004',
    pattern: /alert\s*\(/,
    severity: 'info',
    category: 'bestPractices',
    message: 'alert() used — blocks user interaction',
    suggestion: 'Use a proper UI notification/toast system instead of browser alerts.',
  },
  {
    id: 'BP-005',
    pattern: /\.then\s*\(.*\.then\s*\(.*\.then/,
    severity: 'warning',
    category: 'bestPractices',
    message: 'Deeply chained .then() calls — callback hell',
    suggestion: 'Refactor to async/await for more readable asynchronous code.',
  },
  {
    id: 'BP-006',
    pattern: /import\s+\*\s+as\s+/,
    severity: 'info',
    category: 'bestPractices',
    message: 'Wildcard import — imports entire module',
    suggestion: 'Import only what you need for better tree-shaking and bundle size.',
  },
  {
    id: 'BP-007',
    pattern: /async\s+\w+\s*\([^)]*\)\s*\{[^}]*\}(?!.*await)/,
    severity: 'info',
    category: 'bestPractices',
    message: 'Async function without await — unnecessary async wrapper',
    suggestion: 'Remove async keyword if the function does not use await.',
  },

  // ── Performance Rules ─────────────────────────────────────────
  {
    id: 'PERF-001',
    pattern: /new\s+RegExp\s*\(/,
    severity: 'info',
    category: 'performance',
    message: 'Dynamic RegExp construction — may be inside a loop',
    suggestion: 'Define regex patterns as constants outside loops for better performance.',
  },
  {
    id: 'PERF-002',
    pattern: /document\.getElementById|document\.querySelector(?!All)/,
    severity: 'info',
    category: 'performance',
    message: 'Direct DOM query — may cause layout thrashing if repeated',
    suggestion: 'Cache DOM references in variables. In React, use refs instead.',
  },
  {
    id: 'PERF-003',
    pattern: /JSON\.parse\s*\(\s*JSON\.stringify/,
    severity: 'warning',
    category: 'performance',
    message: 'JSON.parse(JSON.stringify()) used for deep cloning — slow and lossy',
    suggestion: 'Use structuredClone() or a library like lodash.cloneDeep for deep cloning.',
  },
  {
    id: 'PERF-004',
    pattern: /\.\s*forEach\s*\(.*\.\s*(push|concat|splice)\s*\(/,
    severity: 'info',
    category: 'performance',
    message: 'Array mutation inside forEach — consider using map/filter/reduce',
    suggestion: 'Use .map(), .filter(), or .reduce() for functional, more readable transformations.',
  },
  {
    id: 'PERF-005',
    pattern: /setTimeout\s*\(\s*['"][^'"]*['"]\s*,/,
    severity: 'warning',
    category: 'performance',
    message: 'setTimeout with string argument — triggers eval-like behavior',
    suggestion: 'Pass a function reference to setTimeout instead of a string.',
  },

  // ── Style Rules ───────────────────────────────────────────────
  {
    id: 'STY-001',
    pattern: /^\s*\n\s*\n\s*\n/,
    severity: 'info',
    category: 'style',
    message: 'Multiple consecutive blank lines',
    suggestion: 'Use a single blank line to separate code blocks for cleaner formatting.',
  },
  {
    id: 'STY-002',
    pattern: /\t/,
    severity: 'info',
    category: 'style',
    message: 'Tab character used for indentation',
    suggestion: 'Use consistent spacing (2 or 4 spaces). Configure your editor\'s indent style.',
  },
  {
    id: 'STY-003',
    pattern: /\s+$/,
    severity: 'info',
    category: 'style',
    message: 'Trailing whitespace detected',
    suggestion: 'Enable "trim trailing whitespace on save" in your editor.',
  },
];

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
