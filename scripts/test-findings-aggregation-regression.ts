import assert from 'assert';
import { analyzeCode, aggregateFindings, maskSensitiveSnippet, Finding } from '../src/analyzer';
import { mergePreflightFindingsIntoReport, SuspiciousFinding } from '../src/lib/upload/projectContext';
import {
  getCategoryFromRule,
  getRealWorldScenario,
  getCategoryBadge,
  getImpactSectionTitle,
  generateRemediationMarkdown,
} from '../src/components/workflows/SecurityReportPanel';

console.log('==================================================================');
console.log('   AUTOMATED REGRESSION TEST SUITE: FINDINGS AGGREGATION & CATEGORIES');
console.log('==================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: QUA-008 is categorized as quality, NOT counted as a security vulnerability
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Test 1: QUA-008 is not counted as a security vulnerability ---');
{
  const nestedCode = `
function processNestedData(a: any) {
  if (a) {
    if (a.b) {
      if (a.b.c) {
        if (a.b.c.d) {
          if (a.b.c.d.e) {
            if (a.b.c.d.e.f) {
              if (a.b.c.d.e.f.g) {
                console.log(a.b.c.d.e.f.g);
              }
            }
          }
        }
      }
    }
  }
}
`;

  const report = analyzeCode(nestedCode);
  const qua008 = report.findings.find(f => f.rule === 'QUA-008');

  assert(qua008, 'Expected QUA-008 finding for deep nesting');
  assert.strictEqual(qua008.category, 'quality', 'QUA-008 must have category "quality"');
  assert.strictEqual(report.categoryCounts.quality >= 1, true, 'Quality count must be >= 1');
  assert.strictEqual(report.categoryCounts.security, 0, 'Security count must be 0 for pure quality issues');
  assert.strictEqual(report.securitySummary?.total, 0, 'Security summary total must be 0');

  // Verify UI helpers
  assert.strictEqual(getCategoryFromRule('QUA-008'), 'quality');
  const badge = getCategoryBadge(qua008);
  assert.strictEqual(badge.label, 'QUALITY', 'Badge for quality finding must be QUALITY');
  assert(!badge.label.toLowerCase().includes('vulnerability'), 'Badge must not include "vulnerability"');
  assert(!badge.label.toLowerCase().includes('security'), 'Badge must not include "security"');

  const impactTitle = getImpactSectionTitle(qua008);
  assert.strictEqual(impactTitle, 'Maintainability & Readability Impact');

  const scenario = getRealWorldScenario(qua008);
  assert(!scenario.toLowerCase().includes('attacker'), 'Scenario must not fabricate attacker exploit for QUA-008');
  assert(!scenario.toLowerCase().includes('vulnerability could allow'), 'Scenario must not call QUA-008 an exploitable vulnerability');
  assert(scenario.toLowerCase().includes('read') || scenario.toLowerCase().includes('maintain') || scenario.toLowerCase().includes('complexity'), 'Scenario must explain maintainability/readability impact');

  console.log('  [PASS] QUA-008 is correctly categorized as quality with maintainability impact and zero security counts');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Quality/style findings don't cause a false security FAIL
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 2: Quality findings do not cause a false security FAIL ---');
{
  // Code with various quality and style issues, but NO security vulnerabilities
  const qualityCode = `
// Long function with deep nesting, var, empty catch, and magic numbers
function messyFunction() {
  var x = 10;
  var y = 20;
  try {
    if (x == 10) {
      if (y == 20) {
        if (x + y == 30) {
          if (x * y == 200) {
            if (x - y == -10) {
              const retryLimit = 42;
            }
          }
        }
      }
    }
  } catch (e) {
  }
}
`;

  const report = analyzeCode(qualityCode);

  assert(report.findings.length > 0, 'Should find quality/style issues');
  assert.strictEqual(report.categoryCounts.security, 0, 'Must have zero security findings');
  assert(report.categoryCounts.quality > 0, 'Must have quality findings');
  assert.strictEqual(report.verdict, 'PASS', 'Report verdict must be PASS when security vulnerabilities = 0');

  // Merge preflight with 0 security findings
  const merged = mergePreflightFindingsIntoReport([], report);
  assert.strictEqual(merged.verdict, 'PASS', 'Merged verdict must remain PASS when security vulnerabilities = 0');
  assert.strictEqual(merged.securitySummary?.total, 0, 'Merged securitySummary total must be 0');

  console.log('  [PASS] Quality and style issues yield PASS verdict with 0 security vulnerabilities');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Repeated identical findings are intelligently aggregated
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 3: Repeated identical findings are aggregated ---');
{
  // Simulate 15 files with repeated deep nesting (simulating the 555 QUA-008 findings in production)
  let multiFileCode = '';
  for (let f = 1; f <= 15; f++) {
    multiFileCode += `<FILE path="src/module_${f}.ts">\n`;
    for (let j = 1; j <= 20; j++) {
      multiFileCode += `                if (level5_${j}) { doWork(); }\n`;
    }
    multiFileCode += `</FILE>\n`;
  }

  const report = analyzeCode(multiFileCode);

  // Instead of 300 individual QUA-008 items polluting the findings array,
  // there should be exactly 1 aggregated QUA-008 finding
  const qua008Findings = report.findings.filter(f => f.rule === 'QUA-008');
  assert.strictEqual(qua008Findings.length, 1, 'QUA-008 findings must be aggregated into exactly 1 finding');

  const aggregated = qua008Findings[0];
  assert(aggregated.count && aggregated.count >= 200, `Expected >= 200 occurrences, got ${aggregated.count}`);
  assert(aggregated.occurrences && aggregated.occurrences.length === aggregated.count, 'Occurrences array length must match count');

  // Check that file information is preserved inside occurrences
  const uniqueFiles = new Set(aggregated.occurrences.map(o => o.file));
  assert.strictEqual(uniqueFiles.size, 15, 'All 15 file locations must be preserved in occurrences');

  // Check occurrence structure
  const firstOcc = aggregated.occurrences[0];
  assert(firstOcc.file && firstOcc.file.startsWith('src/module_'), 'Occurrence must record file path');
  assert(firstOcc.line > 0, 'Occurrence must record line number in file');

  console.log(`  [PASS] Aggregated ${aggregated.count} QUA-008 occurrences across 15 files into 1 consolidated finding`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Real secret findings remain security findings and are strictly masked
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 4: Real secret findings remain security findings ---');
{
  const sampleStripeKey = ['sk', 'test', 'FAKEsampleKEY1234567890123456'].join('_');
  const sampleAwsKey = ['AKIA', '00000000FAKEAWS0'].join('');
  const secretCode = `
const stripeSecret = "${sampleStripeKey}";
const awsAccessKey = "${sampleAwsKey}";
`;

  const report = analyzeCode(secretCode);
  const securityFindings = report.findings.filter(f => f.category === 'security');

  assert(securityFindings.length >= 1, 'Expected security findings for secrets');
  assert(report.categoryCounts.security >= 1, 'Security count must be >= 1');
  assert(report.securitySummary && report.securitySummary.total >= 1, 'securitySummary total must be >= 1');
  assert.strictEqual(report.verdict, 'FAIL', 'Real security vulnerability must cause verdict FAIL');

  // Verify masking
  for (const sf of securityFindings) {
    assert(!sf.snippet?.includes(sampleStripeKey), 'Raw Stripe secret must NOT be in snippet');
    assert(!sf.snippet?.includes(sampleAwsKey), 'Raw AWS key must NOT be in snippet');
    assert(sf.snippet?.includes('••••••••[REDACTED]'), 'Snippet must include redacted marker');

    const badge = getCategoryBadge(sf);
    assert(badge.label === 'CRITICAL' || badge.label === 'HIGH', 'Security badge must be CRITICAL or HIGH');
    assert.strictEqual(sf.category, 'security', 'Finding category must be security');

    const impactTitle = getImpactSectionTitle(sf);
    assert.strictEqual(impactTitle, 'Security Impact');

    const scenario = getRealWorldScenario(sf);
    assert(scenario.toLowerCase().includes('secret') || scenario.toLowerCase().includes('key') || scenario.toLowerCase().includes('credential'), 'Scenario must detail secret exposure consequences');
  }

  console.log('  [PASS] Real secrets remain security findings, trigger FAIL verdict, and are strictly masked');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Preflight findings are merged once and deduplicate downstream analyzer secrets
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 5: Preflight findings merge once without duplicates ---');
{
  const preflightSecrets: SuspiciousFinding[] = [
    {
      fileName: 'src/auth/config.ts',
      line: 4,
      category: 'secret',
      rule: 'AWS_ACCESS_KEY',
      severity: 'critical',
      maskedSnippet: 'const key = "••••••••[REDACTED]";',
    },
  ];

  // Downstream analyzer also detected SEC-003 on the exact same file and line
  const baseReport = {
    vibeScore: 70,
    findings: [
      {
        rule: 'SEC-003',
        severity: 'critical' as const,
        category: 'security' as const,
        message: 'Hardcoded secret detected',
        line: 4,
        file: 'src/auth/config.ts',
        suggestion: 'Store credentials in environment variables',
        snippet: 'const key = "••••••••[REDACTED]";',
      },
      {
        rule: 'QUA-008',
        severity: 'warning' as const,
        category: 'quality' as const,
        message: 'Deep nesting detected',
        line: 15,
        file: 'src/auth/config.ts',
        suggestion: 'Flatten structure',
      },
    ],
    summary: { critical: 1, warning: 1, info: 0 },
    categoryCounts: { security: 1, quality: 1, bestPractices: 0, performance: 0, style: 0 },
    totalLines: 30,
    analyzedAt: new Date(),
  };

  const merged = mergePreflightFindingsIntoReport(preflightSecrets, baseReport);

  // Should have exactly 1 secret finding (preflight version, with SEC-003 deduplicated)
  const secretsInReport = merged.findings.filter(f => f.category === 'security');
  assert.strictEqual(secretsInReport.length, 1, 'Preflight secret must replace downstream duplicate');
  assert.strictEqual(secretsInReport[0].rule, 'SEC-PREFLIGHT-AWS_ACCESS_KEY');
  assert.strictEqual(secretsInReport[0].file, 'src/auth/config.ts');

  // Idempotency: Merging again must not duplicate preflight finding
  const mergedTwice = mergePreflightFindingsIntoReport(preflightSecrets, merged);
  const secretsInMergedTwice = mergedTwice.findings.filter(f => f.category === 'security');
  assert.strictEqual(secretsInMergedTwice.length, 1, 'Calling merge twice must not duplicate finding');

  console.log('  [PASS] Preflight findings deduplicate downstream secrets and merge idempotently');
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Paste Code and GitHub review contracts remain intact
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Test 6: Paste Code and GitHub review behavior remain unchanged ---');
{
  // 6A. Paste code clean snippet -> PASS
  const cleanPaste = `
export function add(a: number, b: number): number {
  return a + b;
}
`;
  const cleanPasteReport = analyzeCode(cleanPaste);
  assert.strictEqual(cleanPasteReport.verdict, 'PASS');
  assert.strictEqual(cleanPasteReport.categoryCounts.security, 0);

  // 6B. Paste code vulnerability (e.g. eval) -> FAIL
  const vulnPaste = `
export function runScript(cmd: string) {
  return eval(cmd);
}
`;
  const vulnPasteReport = analyzeCode(vulnPaste);
  assert.strictEqual(vulnPasteReport.verdict, 'FAIL');
  assert(vulnPasteReport.categoryCounts.security > 0);
  assert(vulnPasteReport.findings.some(f => f.rule === 'SEC-001' && f.category === 'security'));

  // 6C. GitHub review structure (findings grouped in { critical: [], warning: [], info: [] })
  const githubReport = {
    verdict: 'FAIL',
    reviewType: 'github',
    repository: { name: 'octocat/hello-world' },
    findings: {
      critical: [
        {
          rule: 'SQL_INJECTION',
          title: 'SQL_INJECTION: src/db.ts:12',
          category: 'security',
          severity: 'critical',
          file: 'src/db.ts',
          line: 12,
        },
      ],
      warning: [
        {
          rule: 'QUA-008',
          title: 'QUA-008: src/util.ts:25',
          category: 'quality',
          severity: 'warning',
          file: 'src/util.ts',
          line: 25,
        },
      ],
      info: [],
    },
    summary: { critical: 1, warning: 1, info: 0 },
    categoryCounts: { security: 1, quality: 1, bestPractices: 0, performance: 0, style: 0 },
  };

  const md = generateRemediationMarkdown(githubReport, [
    ...githubReport.findings.critical.map(f => ({ ...f, _severityLabel: 'CRITICAL' })),
    ...githubReport.findings.warning.map(f => ({ ...f, _severityLabel: 'MEDIUM' })),
  ]);

  assert(md.includes('octocat/hello-world'), 'Markdown must preserve repo name');
  assert(md.includes('Security Vulnerabilities:** 1'), 'Markdown must separate security count');
  assert(md.includes('Quality Issues:** 1'), 'Markdown must separate quality count');
  assert(md.includes('SQL_INJECTION'), 'Markdown must list SQL injection');

  console.log('  [PASS] Paste Code and GitHub review contracts, verdicts, and markdown remain 100% intact');
}

console.log('\n==================================================================');
console.log('   ALL 6 FINDINGS AGGREGATION & CATEGORY REGRESSION TESTS PASSED!');
console.log('==================================================================\n');
