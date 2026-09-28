/**
 * AUTOMATED TEST SUITE: GROUP SECURITY FINDINGS BY RULE PRESENTATION
 *
 * Verifies the presentation refinement:
 * - Group findings by the same security rule/category into ONE top-level expandable finding.
 * - Under-the-hood data model preserves all original findings completely.
 * - Canonical grouping key uses rule / ruleId / category / clean issue name.
 * - Top-level row displays: [Rule / Category] [Severity] [Count] >
 * - Expanded group renders all underlying occurrences with location, snippet, issue,
 *   impact, remediation, coding agent prompt, and copy button.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  groupFindingsByRule,
  getFindingRule,
  getGroupBadge,
  getSeverityRank,
  FindingGroup,
} from '../src/components/workflows/SecurityReportPanel';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: GROUP FINDINGS BY SECURITY RULE');
console.log('==================================================================\n');

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    process.exit(1);
  }
}

async function runAllTests() {
  // Test 1: Multiple occurrences of the same rule group into one item with accurate count
  await runTest('1. Multiple occurrences of the same rule are grouped into ONE top-level item with occurrence count', () => {
    const rawFindings = [
      { rule: 'AUTH_BYPASS', file: 'src/Onboarding.tsx', line: 17, severity: 'high', category: 'security' },
      { rule: 'AUTH_BYPASS', file: 'src/Onboarding.tsx', line: 26, severity: 'high', category: 'security' },
      { rule: 'AUTH_BYPASS', file: 'src/Onboarding.tsx', line: 42, severity: 'high', category: 'security' },
      { rule: 'SECRET_EXPOSURE', file: 'test-sample.js', line: 3, severity: 'high', category: 'security' },
      { rule: 'SECRET_EXPOSURE', file: 'test-sample.js', line: 4, severity: 'high', category: 'security' },
      { rule: 'XSS', file: 'src/components/Render.tsx', line: 12, severity: 'high', category: 'security' },
      { rule: 'XSS', file: 'src/components/Render.tsx', line: 35, severity: 'high', category: 'security' },
      { rule: 'INPUT_VALIDATION', file: 'src/api/handler.ts', line: 50, severity: 'high', category: 'security' },
      { rule: 'SQL_INJECTION', file: 'src/db/query.ts', line: 101, severity: 'high', category: 'security' },
      { rule: 'CRYPTOGRAPHIC_FAILURE', file: 'src/crypto/jwt.ts', line: 15, severity: 'medium', category: 'security' },
    ];

    const groups = groupFindingsByRule(rawFindings);

    // Should create exactly 6 groups
    assert.strictEqual(groups.length, 6, `Expected 6 groups, got ${groups.length}`);

    // Verify AUTH_BYPASS group
    const authGroup = groups.find(g => g.rule === 'AUTH_BYPASS');
    assert(authGroup, 'Expected AUTH_BYPASS group');
    assert.strictEqual(authGroup.totalOccurrences, 3, 'AUTH_BYPASS must have 3 occurrences');
    assert.strictEqual(authGroup.findings.length, 3, 'AUTH_BYPASS group must retain all 3 underlying findings');
    assert.strictEqual(authGroup.highestSeverityLabel, 'HIGH');

    // Verify SECRET_EXPOSURE group
    const secretGroup = groups.find(g => g.rule === 'SECRET_EXPOSURE');
    assert(secretGroup, 'Expected SECRET_EXPOSURE group');
    assert.strictEqual(secretGroup.totalOccurrences, 2, 'SECRET_EXPOSURE must have 2 occurrences');
    assert.strictEqual(secretGroup.findings.length, 2, 'SECRET_EXPOSURE must retain all 2 underlying findings');

    // Verify XSS group
    const xssGroup = groups.find(g => g.rule === 'XSS');
    assert(xssGroup, 'Expected XSS group');
    assert.strictEqual(xssGroup.totalOccurrences, 2);

    // Verify single-occurrence groups
    const inputValGroup = groups.find(g => g.rule === 'INPUT_VALIDATION');
    assert(inputValGroup, 'Expected INPUT_VALIDATION group');
    assert.strictEqual(inputValGroup.totalOccurrences, 1);

    const sqlGroup = groups.find(g => g.rule === 'SQL_INJECTION');
    assert(sqlGroup, 'Expected SQL_INJECTION group');
    assert.strictEqual(sqlGroup.totalOccurrences, 1);

    const cryptoGroup = groups.find(g => g.rule === 'CRYPTOGRAPHIC_FAILURE');
    assert(cryptoGroup, 'Expected CRYPTOGRAPHIC_FAILURE group');
    assert.strictEqual(cryptoGroup.totalOccurrences, 1);
    assert.strictEqual(cryptoGroup.highestSeverityLabel, 'MEDIUM');
  });

  // Test 2: Invariant: Underlying individual findings are NEVER deleted or merged away
  await runTest('2. Invariant: Underlying individual findings are completely preserved in original order', () => {
    const rawFindings = [
      { rule: 'AUTH_BYPASS', file: 'src/A.ts', line: 10, message: 'Issue 1', suggestion: 'Fix 1' },
      { rule: 'AUTH_BYPASS', file: 'src/B.ts', line: 20, message: 'Issue 2', suggestion: 'Fix 2' },
      { rule: 'AUTH_BYPASS', file: 'src/C.ts', line: 30, message: 'Issue 3', suggestion: 'Fix 3' },
    ];

    const groups = groupFindingsByRule(rawFindings);
    const authGroup = groups[0];

    assert.strictEqual(authGroup.findings.length, 3);
    assert.strictEqual(authGroup.findings[0].file, 'src/A.ts');
    assert.strictEqual(authGroup.findings[0].line, 10);
    assert.strictEqual(authGroup.findings[0].message, 'Issue 1');
    assert.strictEqual(authGroup.findings[0].suggestion, 'Fix 1');

    assert.strictEqual(authGroup.findings[1].file, 'src/B.ts');
    assert.strictEqual(authGroup.findings[1].line, 20);

    assert.strictEqual(authGroup.findings[2].file, 'src/C.ts');
    assert.strictEqual(authGroup.findings[2].line, 30);
  });

  // Test 3: Canonical grouping key handles ruleId, criterionId, and cleans location suffixes
  await runTest('3. Canonical grouping key resolves cleanly across rule, ruleId, and titles with locations', () => {
    const findingsWithLocationTitles = [
      { title: 'AUTH_BYPASS: src/Onboarding.tsx:17', file: 'src/Onboarding.tsx', line: 17 },
      { title: 'AUTH_BYPASS: src/Onboarding.tsx:26', file: 'src/Onboarding.tsx', line: 26 },
      { title: 'AUTH_BYPASS: src/Onboarding.tsx:42', file: 'src/Onboarding.tsx', line: 42 },
    ];

    assert.strictEqual(getFindingRule(findingsWithLocationTitles[0]), 'AUTH_BYPASS');
    assert.strictEqual(getFindingRule(findingsWithLocationTitles[1]), 'AUTH_BYPASS');
    assert.strictEqual(getFindingRule(findingsWithLocationTitles[2]), 'AUTH_BYPASS');

    const groups = groupFindingsByRule(findingsWithLocationTitles);
    assert.strictEqual(groups.length, 1, 'All 3 location-titled findings must group into 1 AUTH_BYPASS group');
    assert.strictEqual(groups[0].rule, 'AUTH_BYPASS');
    assert.strictEqual(groups[0].totalOccurrences, 3);
  });

  // Test 4: Highest severity rank is correctly computed for mixed-severity occurrences
  await runTest('4. Group highest severity reflects the most critical severity among occurrences', () => {
    const mixedFindings = [
      { rule: 'SEC-TOKEN', severity: 'warning', file: 'a.js', line: 1 },
      { rule: 'SEC-TOKEN', severity: 'critical', file: 'b.js', line: 2 },
      { rule: 'SEC-TOKEN', severity: 'info', file: 'c.js', line: 3 },
    ];

    const groups = groupFindingsByRule(mixedFindings);
    assert.strictEqual(groups[0].highestSeverityRank, 1);
    assert.strictEqual(groups[0].highestSeverityLabel, 'HIGH');
    const badge = getGroupBadge(groups[0]);
    assert.strictEqual(badge.label, 'HIGH');
    assert(badge.className.includes('red'));
  });

  // Test 5: Common CWE badge detection
  await runTest('5. Common CWE is detected when all occurrences share the same CWE', () => {
    const sameCweFindings = [
      { rule: 'XSS', cwes: ['CWE-79'], file: 'a.js', line: 1 },
      { rule: 'XSS', cwes: ['CWE-79'], file: 'b.js', line: 2 },
    ];
    const group1 = groupFindingsByRule(sameCweFindings)[0];
    assert.strictEqual(group1.commonCwe, 'CWE-79');

    const mixedCweFindings = [
      { rule: 'XSS', cwes: ['CWE-79'], file: 'a.js', line: 1 },
      { rule: 'XSS', cwes: ['CWE-116'], file: 'b.js', line: 2 },
    ];
    const group2 = groupFindingsByRule(mixedCweFindings)[0];
    assert.strictEqual(group2.commonCwe, null, 'Mixed CWEs must result in null commonCwe');
    assert.strictEqual(group2.allCwes.length, 2);
  });

  // Test 6: Stable ordering puts High security groups first, followed by Medium and non-security
  await runTest('6. Group sorting: Security HIGH first, then MEDIUM, then other categories', () => {
    const rawFindings = [
      { rule: 'STYLE-001', category: 'style', severity: 'info' },
      { rule: 'CRYPTO_WEAK', category: 'security', severity: 'medium' },
      { rule: 'AUTH_BYPASS', category: 'security', severity: 'high' },
      { rule: 'AUTH_BYPASS', category: 'security', severity: 'high' },
      { rule: 'QUA-008', category: 'quality', severity: 'warning' },
    ];

    const groups = groupFindingsByRule(rawFindings);
    assert.strictEqual(groups[0].rule, 'AUTH_BYPASS'); // Security HIGH
    assert.strictEqual(groups[1].rule, 'CRYPTO_WEAK'); // Security MEDIUM
    assert.strictEqual(groups[2].category, 'quality');  // Quality
    assert.strictEqual(groups[3].category, 'style');    // Style
  });

  // Test 7: Reusable GroupedFindingsList component contract verification
  await runTest('7. GroupedFindingsList.tsx provides category headers with always-visible individual occurrences and expandable details', () => {
    const listPath = path.resolve('src/components/common/GroupedFindingsList.tsx');
    const listCode = fs.readFileSync(listPath, 'utf8');

    // Verify groupFindingsByRule is invoked
    assert(listCode.includes('groupFindingsByRule(findings'), 'GroupedFindingsList must group findings by rule');

    // Verify category header rendering
    assert(listCode.includes('groups.map((group: FindingGroup'), 'Must map over groups');
    assert(listCode.includes('group.rule'), 'Must display group rule');
    assert(listCode.includes('group.totalOccurrences'), 'Must display occurrences count badge');
    assert(listCode.includes('CIRCLED_NUMBERS'), 'Must use sequential category numbering (①, ②, etc.)');

    // Verify individual occurrences are mapped and rendered visible by default under each category
    assert(listCode.includes('group.findings.map((finding: any, occIdx: number)'), 'Must render all underlying findings inside each category');
    assert(listCode.includes('occIdx + 1'), 'Underlying findings must be numbered sequentially');
    assert(listCode.includes('locStr'), 'Must display location for each occurrence');
    assert(listCode.includes('toggleIssue(issueKey)'), 'Must toggle individual issue on click');

    // Verify expandable details per issue
    assert(listCode.includes('getCodingAgentPrompt(finding)'), 'Must provide coding agent prompt per finding');
    assert(listCode.includes('handleCopyPrompt'), 'Must provide prompt copy button per finding');

    // Verify Expand all / Collapse all toggles
    assert(listCode.includes('toggleExpandAll'), 'Must provide Expand all / Collapse all toggle');
  });

  // Test 8: SecurityReportPanel uses GroupedFindingsList
  await runTest('8. SecurityReportPanel.tsx delegates finding rendering to shared GroupedFindingsList', () => {
    const panelPath = path.resolve('src/components/workflows/SecurityReportPanel.tsx');
    const panelCode = fs.readFileSync(panelPath, 'utf8');

    assert(panelCode.includes('<GroupedFindingsList'), 'SecurityReportPanel must render GroupedFindingsList');
    assert(panelCode.includes('findings={displayedFindings}'), 'SecurityReportPanel must pass displayedFindings to GroupedFindingsList');
  });

  // Test 9: HistoricalReportView uses GroupedFindingsList
  await runTest('9. HistoricalReportView.tsx renders Review history findings using shared GroupedFindingsList', () => {
    const historyViewPath = path.resolve('src/components/analysis/HistoricalReportView.tsx');
    const historyCode = fs.readFileSync(historyViewPath, 'utf8');

    assert(historyCode.includes('<GroupedFindingsList'), 'HistoricalReportView must render GroupedFindingsList');
    assert(historyCode.includes('findings={allFindings}'), 'HistoricalReportView must pass allFindings to GroupedFindingsList');
  });

  console.log('\n==================================================================');
  console.log('   ALL 9 GROUPED FINDINGS PRESENTATION TESTS PASSED!');
  console.log('==================================================================');
}

runAllTests();
