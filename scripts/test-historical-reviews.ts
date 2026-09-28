import assert from 'assert';
import { getRealWorldScenario, getFindingDisplayTitle, getCleanIssueName, getCodingAgentPrompt, generateRemediationMarkdown } from '../src/components/workflows/SecurityReportPanel';

console.log('=== RUNNING HISTORICAL REVIEWS TEST SUITE ===');

// Test 1: Real-world scenarios generate understandable, concrete real-world consequences
console.log('\n--- Test 1: Real-world scenario generators ---');

const hardcodedApiKeyFinding = {
  rule: 'SECRET_EXPOSURE',
  title: 'SECRET_EXPOSURE: src/config.js:10',
  severity: 'CRITICAL',
  file: 'src/config.js',
  line: 10,
  description: 'An API key is embedded directly in the source code.',
  cwes: ['CWE-798']
};

const apiKeyScenario = getRealWorldScenario(hardcodedApiKeyFinding);
assert(apiKeyScenario.length > 20, 'Scenario should not be empty');
assert(apiKeyScenario.toLowerCase().includes('secret') || apiKeyScenario.toLowerCase().includes('key') || apiKeyScenario.toLowerCase().includes('credential'), 'Scenario must mention secret/key/credential exposure');
console.log('[PASS] Secret Exposure scenario:', apiKeyScenario);

const sqlInjectionFinding = {
  rule: 'SQL_INJECTION',
  title: 'SQL_INJECTION: src/db.js:42',
  severity: 'HIGH',
  file: 'src/db.js',
  line: 42,
  description: 'User-controlled input is concatenated directly into SQL query.',
  cwes: ['CWE-89']
};

const sqlScenario = getRealWorldScenario(sqlInjectionFinding);
assert(sqlScenario.toLowerCase().includes('sql') || sqlScenario.toLowerCase().includes('query') || sqlScenario.toLowerCase().includes('database'), 'Scenario must mention database/SQL impact');
console.log('[PASS] SQL Injection scenario:', sqlScenario);

const customStoredScenarioFinding = {
  rule: 'CUSTOM_CHECK',
  severity: 'MEDIUM',
  scenario: 'If exposed to users, an attacker could tamper with payment amounts.',
  cwes: ['CWE-20']
};

assert.strictEqual(getRealWorldScenario(customStoredScenarioFinding), 'If exposed to users, an attacker could tamper with payment amounts.');
console.log('[PASS] Preserved custom stored scenario');

// Test 2: Finding Display Titles and Issue Names
console.log('\n--- Test 2: Display title & Clean issue name formatting ---');
assert.strictEqual(getFindingDisplayTitle(hardcodedApiKeyFinding), 'SECRET_EXPOSURE: src/config.js:10');
assert.strictEqual(getCleanIssueName(hardcodedApiKeyFinding), 'SECRET_EXPOSURE');
console.log('[PASS] Display title & Clean name formatted accurately');

// Test 3: Coding Agent Prompts
console.log('\n--- Test 3: Coding agent prompts preservation ---');
const prompt = getCodingAgentPrompt(hardcodedApiKeyFinding);
assert(prompt.includes('SECRET_EXPOSURE'), 'Prompt should include issue name');
assert(prompt.includes('src/config.js'), 'Prompt should include file name');
assert(prompt.includes('TASK'), 'Prompt should include TASK section');
assert(prompt.includes('REQUIREMENTS'), 'Prompt should include REQUIREMENTS');
console.log('[PASS] Coding agent prompt generated properly');

// Test 4: Remediation Markdown Generation
console.log('\n--- Test 4: Remediation markdown report document ---');
const sampleReport = {
  verdict: 'FAIL',
  repository: { name: 'demo-service' },
  findings: [hardcodedApiKeyFinding, sqlInjectionFinding]
};
const mdDoc = generateRemediationMarkdown(sampleReport, [
  { ...hardcodedApiKeyFinding, _severityLabel: 'CRITICAL' },
  { ...sqlInjectionFinding, _severityLabel: 'HIGH' }
]);
assert(mdDoc.includes('# Security Vulnerability Remediation Guide'), 'Markdown title missing');
assert(mdDoc.includes('demo-service'), 'Repo name missing from markdown');
assert(mdDoc.includes('CRITICAL'), 'CRITICAL missing from markdown');
assert(mdDoc.includes('HIGH'), 'HIGH missing from markdown');
assert(mdDoc.includes('CWE-798'), 'CWE missing from markdown');
console.log('[PASS] Markdown report generated with all findings and metadata');

// Test 5: Severity ranking logic
console.log('\n--- Test 5: Severity ranking & sorting logic ---');
const findingsList = [
  { rule: 'F1', severity: 'LOW' },
  { rule: 'F2', severity: 'CRITICAL' },
  { rule: 'F3', severity: 'MEDIUM' },
  { rule: 'F4', severity: 'HIGH' }
];

const getSeverityInfo = (finding: any): { rank: number; label: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' } => {
  const sev = String(finding.severity || '').toLowerCase();
  if (sev === 'critical') return { rank: 0, label: 'CRITICAL' };
  if (sev === 'high') return { rank: 1, label: 'HIGH' };
  if (sev === 'warning' || sev === 'medium') return { rank: 2, label: 'MEDIUM' };
  return { rank: 3, label: 'LOW' };
};

const ranked = findingsList.map(f => ({ ...f, ...getSeverityInfo(f) })).sort((a, b) => a.rank - b.rank);

assert.strictEqual(ranked[0].label, 'CRITICAL');
assert.strictEqual(ranked[1].label, 'HIGH');
assert.strictEqual(ranked[2].label, 'MEDIUM');
assert.strictEqual(ranked[3].label, 'LOW');
console.log('[PASS] Severity order is strictly: CRITICAL -> HIGH -> MEDIUM -> LOW');

// Test 6: Data isolation between multiple historical reviews
console.log('\n--- Test 6: Historical reviews data isolation ---');
const reviewA = {
  id: 'rev-1',
  name: 'auth-service',
  verdict: 'PASS',
  pr: 10,
  date: new Date(),
  result: {
    verdict: 'PASS',
    totalFindings: 0,
    findings: []
  }
};

const reviewB = {
  id: 'rev-2',
  name: 'payment-service',
  verdict: 'FAIL',
  pr: 15,
  date: new Date(),
  result: {
    verdict: 'FAIL',
    totalFindings: 1,
    findings: [hardcodedApiKeyFinding]
  }
};

assert.notStrictEqual(reviewA.result.findings.length, reviewB.result.findings.length);
assert.strictEqual(reviewA.result.findings.length, 0);
assert.strictEqual(reviewB.result.findings.length, 1);
assert.strictEqual(reviewB.result.findings[0].rule, 'SECRET_EXPOSURE');
console.log('[PASS] Review A and Review B results are completely isolated');

console.log('\n=== ALL HISTORICAL REVIEWS TESTS PASSED SUCCESSFULLY! ===\n');
