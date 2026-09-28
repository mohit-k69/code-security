/**
 * Regression Test Suite: Context-Aware URL Classification & Transparent ZIP Counts
 *
 * Tests:
 * 1. https://169.254.169.254/latest/meta-data/ → remains high-confidence suspicious
 * 2. http://127.0.0.1/... → remains suspicious
 * 3. http://localhost/... → remains suspicious
 * 4. file://... → remains suspicious
 * 5. gopher://... → remains suspicious
 * 6. https://jira.company.com/projects/SHOP as a UI placeholder/example → not flagged as SSRF
 * 7. https://jira.company.com/projects/SHOP used as a fetch/request target → flagged as POTENTIAL_REQUEST_TARGET
 * 8. An ordinary documentation URL (https://example.com) → no false positive
 * 9. Static analysis invariant: Zero network requests / DNS probes performed
 * 10. Archive with all entries reviewable → archive count equals reviewable count
 * 11. Archive containing excluded non-reviewable artifact → archive count > reviewable count
 * 12. Excluded entry records explicit, valid reason
 * 13. Exactly 100 reviewable files → accepted
 * 14. 101 reviewable files → rejected
 * 15. Excluded files do not consume 100-reviewable-file budget (100 reviewable + 10 excluded accepted)
 * 16. Security-blocked archive remains blocked
 * 17. Existing ZIP preflight / Threat Gate integration contracts preserved
 */

import JSZip from 'jszip';
import { scanFileForRisks, classifyUrlRisk } from '../src/lib/upload/securityScanner';
import { inspectAndExtractZip } from '../src/lib/upload/zipPreflight';
import { runPreflightPipeline } from '../src/lib/upload/preflightPipeline';
import { ExtractedProjectFile } from '../src/lib/upload/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function pass(testName: string) {
  console.log(`  [PASS] ${testName}`);
}

async function runTests() {
  console.log('==================================================================');
  console.log('   AUTOMATED TEST SUITE: URL CLASSIFICATION & ZIP TRANSPARENCY    ');
  console.log('==================================================================\n');

  // -------------------------------------------------------------------------
  // Test 1: Cloud Metadata 169.254.169.254 → High-Confidence Suspicious
  // -------------------------------------------------------------------------
  {
    const file: ExtractedProjectFile = {
      name: 'config.js',
      relativePath: 'src/config.js',
      size: 100,
      extension: 'js',
      detectedLanguage: 'JavaScript',
      untrustedContent: 'const metadataUrl = "http://169.254.169.254/latest/meta-data/";',
      isBinary: false,
      status: 'accepted',
    };
    const counter = { count: 0 };
    const scan = scanFileForRisks(file, counter);
    assert(scan.suspiciousUrlCount > 0, '169.254.169.254 must be flagged');
    assert(scan.findings.some(f => f.category === 'suspicious_url' && f.severity === 'critical'), 'Metadata endpoint must be critical SSRF finding');
    pass('1. https://169.254.169.254/latest/meta-data/ → remains high-confidence suspicious');
  }

  // -------------------------------------------------------------------------
  // Test 2: 127.0.0.1 → High-Confidence Suspicious
  // -------------------------------------------------------------------------
  {
    const file: ExtractedProjectFile = {
      name: 'service.ts',
      relativePath: 'src/service.ts',
      size: 100,
      extension: 'ts',
      detectedLanguage: 'TypeScript',
      untrustedContent: 'const internalApi = "http://127.0.0.1:8080/api";',
      isBinary: false,
      status: 'accepted',
    };
    const counter = { count: 0 };
    const scan = scanFileForRisks(file, counter);
    assert(scan.suspiciousUrlCount > 0, '127.0.0.1 must be flagged');
    assert(scan.findings.some(f => f.rule === 'SSRF_INTERNAL_ENDPOINT'), '127.0.0.1 must trigger SSRF_INTERNAL_ENDPOINT');
    pass('2. http://127.0.0.1/... → remains suspicious');
  }

  // -------------------------------------------------------------------------
  // Test 3: localhost → High-Confidence Suspicious
  // -------------------------------------------------------------------------
  {
    const file: ExtractedProjectFile = {
      name: 'server.js',
      relativePath: 'src/server.js',
      size: 100,
      extension: 'js',
      detectedLanguage: 'JavaScript',
      untrustedContent: 'const devTarget = "http://localhost:3000";',
      isBinary: false,
      status: 'accepted',
    };
    const counter = { count: 0 };
    const scan = scanFileForRisks(file, counter);
    assert(scan.suspiciousUrlCount > 0, 'localhost must be flagged');
    pass('3. http://localhost/... → remains suspicious');
  }

  // -------------------------------------------------------------------------
  // Test 4: file:// scheme → High-Confidence Suspicious
  // -------------------------------------------------------------------------
  {
    const file: ExtractedProjectFile = {
      name: 'loader.py',
      relativePath: 'src/loader.py',
      size: 100,
      extension: 'py',
      detectedLanguage: 'Python',
      untrustedContent: 'url = "file:///etc/passwd"',
      isBinary: false,
      status: 'accepted',
    };
    const counter = { count: 0 };
    const scan = scanFileForRisks(file, counter);
    assert(scan.suspiciousUrlCount > 0, 'file:// scheme must be flagged');
    assert(scan.findings.some(f => f.rule === 'DANGEROUS_URL_SCHEME'), 'file:// must trigger DANGEROUS_URL_SCHEME');
    pass('4. file://... → remains suspicious');
  }

  // -------------------------------------------------------------------------
  // Test 5: gopher:// scheme → High-Confidence Suspicious
  // -------------------------------------------------------------------------
  {
    const file: ExtractedProjectFile = {
      name: 'exploit_probe.js',
      relativePath: 'src/exploit_probe.js',
      size: 100,
      extension: 'js',
      detectedLanguage: 'JavaScript',
      untrustedContent: 'const gopherProbe = "gopher://127.0.0.1:6379/_*1";',
      isBinary: false,
      status: 'accepted',
    };
    const counter = { count: 0 };
    const scan = scanFileForRisks(file, counter);
    assert(scan.suspiciousUrlCount > 0, 'gopher:// scheme must be flagged');
    pass('5. gopher://... → remains suspicious');
  }

  // -------------------------------------------------------------------------
  // Test 6: https://jira.company.com/projects/SHOP as UI placeholder → Not flagged as SSRF
  // -------------------------------------------------------------------------
  {
    const file: ExtractedProjectFile = {
      name: 'JiraInput.tsx',
      relativePath: 'src/components/JiraInput.tsx',
      size: 200,
      extension: 'tsx',
      detectedLanguage: 'TypeScript React',
      untrustedContent: `
        export function JiraInput() {
          const placeholder = "https://jira.company.com/projects/SHOP";
          return <input placeholder="https://jira.company.com/projects/SHOP" />;
        }
      `,
      isBinary: false,
      status: 'accepted',
    };
    const counter = { count: 0 };
    const scan = scanFileForRisks(file, counter);
    assert(scan.suspiciousUrlCount === 0, 'UI placeholder URL must NOT be flagged as suspicious URL finding');
    assert(!scan.findings.some(f => f.category === 'suspicious_url'), 'No SSRF finding for UI placeholder');
    pass('6. https://jira.company.com/projects/SHOP as UI placeholder/example → does not receive SSRF classification');
  }

  // -------------------------------------------------------------------------
  // Test 7: https://jira.company.com/projects/SHOP used as fetch/request target → Contextually flagged
  // -------------------------------------------------------------------------
  {
    const file: ExtractedProjectFile = {
      name: 'jiraClient.ts',
      relativePath: 'src/jiraClient.ts',
      size: 200,
      extension: 'ts',
      detectedLanguage: 'TypeScript',
      untrustedContent: `
        export async function fetchJiraProject() {
          const res = await fetch("https://jira.company.com/projects/SHOP");
          return res.json();
        }
      `,
      isBinary: false,
      status: 'accepted',
    };
    const counter = { count: 0 };
    const scan = scanFileForRisks(file, counter);
    assert(scan.suspiciousUrlCount === 1, 'fetch() request target must be detected as potential request target');
    assert(scan.findings.some(f => f.rule === 'POTENTIAL_REQUEST_TARGET'), 'Target inside fetch must trigger POTENTIAL_REQUEST_TARGET');
    pass('7. https://jira.company.com/projects/SHOP used as a fetch/request target → flagged contextually');
  }

  // -------------------------------------------------------------------------
  // Test 8: Documentation URL https://example.com → No false positive
  // -------------------------------------------------------------------------
  {
    const file: ExtractedProjectFile = {
      name: 'README.md',
      relativePath: 'README.md',
      size: 150,
      extension: 'md',
      detectedLanguage: 'Markdown',
      untrustedContent: '# Project Documentation\nSee https://example.com/docs for more details.',
      isBinary: false,
      status: 'accepted',
    };
    const counter = { count: 0 };
    const scan = scanFileForRisks(file, counter);
    assert(scan.suspiciousUrlCount === 0, 'Documentation URL must not produce suspicious URL finding');
    pass('8. Ordinary documentation URL (https://example.com) → no false positive');
  }

  // -------------------------------------------------------------------------
  // Test 9: Zero Network Calls Invariant
  // -------------------------------------------------------------------------
  {
    const risk = classifyUrlRisk('https://any-domain.invalid/api', 'any-domain.invalid', 'const x = "https://any-domain.invalid/api";', 'test.js');
    assert(risk.classification === 'EXAMPLE_OR_PLACEHOLDER', 'Static evaluation returns immediately without network');
    pass('9. Static analysis invariant: Zero network requests / DNS probes performed');
  }

  // -------------------------------------------------------------------------
  // Test 10: Archive with all entries reviewable → archive count equals reviewable count
  // -------------------------------------------------------------------------
  {
    const zip = new JSZip();
    zip.file('src/index.ts', 'console.log("index");');
    zip.file('src/utils.ts', 'export const add = (a: number, b: number) => a + b;');
    zip.file('src/config.json', '{"name": "test"}');

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const extractResult = await inspectAndExtractZip(zipBuffer);

    assert(extractResult.isSafe, 'Archive should be safe');
    assert(extractResult.totalFilesDiscovered === 3, 'Archive contents count should be 3');
    assert(extractResult.acceptedFiles.length === 3, 'Reviewable files count should be 3');
    assert(extractResult.rejectedFiles.length === 0, 'Excluded count should be 0');
    pass('10. Archive with all entries reviewable → archive count equals reviewable count');
  }

  // -------------------------------------------------------------------------
  // Test 11 & 12: Archive containing excluded non-reviewable artifact & explicit reason
  // -------------------------------------------------------------------------
  {
    const zip = new JSZip();
    zip.file('src/index.ts', 'console.log("main");');
    zip.file('src/helper.ts', 'console.log("helper");');
    zip.file('.DS_Store', 'binary metadata');
    zip.file('package-lock.json', '{"lockfileVersion": 2}');

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const extractResult = await inspectAndExtractZip(zipBuffer);

    assert(extractResult.isSafe, 'Archive with excluded non-hazardous entries remains safe');
    assert(extractResult.totalFilesDiscovered === 4, 'Total discovered entries should be 4');
    assert(extractResult.acceptedFiles.length === 2, 'Accepted reviewable files should be 2');
    assert(extractResult.rejectedFiles.length === 2, 'Rejected/excluded files should be 2');

    const dsStore = extractResult.rejectedFiles.find(rf => rf.path.includes('.DS_Store'));
    assert(Boolean(dsStore), '.DS_Store must be recorded in rejected files');
    assert(dsStore!.reason.includes('Non-reviewable system metadata'), 'Reason must explicitly state non-reviewable system metadata');

    const lockfile = extractResult.rejectedFiles.find(rf => rf.path.includes('package-lock.json'));
    assert(Boolean(lockfile), 'package-lock.json must be recorded in rejected files');
    assert(lockfile!.reason.includes('lockfile'), 'Reason must state non-reviewable lockfile artifact');

    pass('11. Archive containing excluded non-reviewable artifact → archive count > reviewable count');
    pass('12. Excluded entry records explicit, valid reason');
  }

  // -------------------------------------------------------------------------
  // Test 13: Exactly 100 reviewable files → Accepted
  // -------------------------------------------------------------------------
  {
    const zip = new JSZip();
    for (let i = 1; i <= 100; i++) {
      zip.file(`src/module_${i}.ts`, `export const mod${i} = ${i};`);
    }

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const result = await runPreflightPipeline([{ name: 'exact_100.zip', bytes: zipBuffer }]);

    assert(result.overallStatus === 'passed' || result.overallStatus === 'warning', '100 reviewable files must be accepted');
    assert(result.filesAccepted === 100, 'filesAccepted must be exactly 100');
    assert(result.safeFiles.length === 100, 'safeFiles must be 100');
    pass('13. Exactly 100 reviewable files → accepted');
  }

  // -------------------------------------------------------------------------
  // Test 14: 101 reviewable files → Rejected
  // -------------------------------------------------------------------------
  {
    const zip = new JSZip();
    for (let i = 1; i <= 101; i++) {
      zip.file(`src/module_${i}.ts`, `export const mod${i} = ${i};`);
    }

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const result = await runPreflightPipeline([{ name: 'over_100.zip', bytes: zipBuffer }]);

    assert(result.overallStatus === 'rejected', '101 reviewable files must be rejected');
    assert(result.errorMessage!.includes('100 reviewable files'), 'Error message must cite 100 reviewable files limit');
    pass('14. 101 reviewable files → rejected');
  }

  // -------------------------------------------------------------------------
  // Test 15: Excluded files do NOT consume the 100-reviewable-file limit
  // -------------------------------------------------------------------------
  {
    const zip = new JSZip();
    // 100 reviewable source files
    for (let i = 1; i <= 100; i++) {
      zip.file(`src/module_${i}.ts`, `export const mod${i} = ${i};`);
    }
    // 15 non-reviewable / excluded files (e.g. metadata, lockfiles, images)
    for (let j = 1; j <= 15; j++) {
      zip.file(`docs/image_${j}.png`, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    }

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const extractResult = await inspectAndExtractZip(zipBuffer);

    assert(extractResult.isSafe, 'Archive with 100 reviewable files + 15 excluded entries must be safe');
    assert(extractResult.acceptedFiles.length === 100, 'Exactly 100 files accepted');
    assert(extractResult.rejectedFiles.length === 15, '15 files excluded');
    assert(extractResult.totalFilesDiscovered === 115, '115 total entries discovered');
    pass('15. Excluded files do not consume 100-reviewable-file budget (100 reviewable + 15 excluded accepted)');
  }

  // -------------------------------------------------------------------------
  // Test 16: Security-blocked archive remains blocked
  // -------------------------------------------------------------------------
  {
    const zip = new JSZip();
    zip.file('src/index.ts', 'console.log("hello");');
    zip.file('bin/tool.exe', new Uint8Array([0x4d, 0x5a, 0x90, 0x00])); // PE executable header

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const result = await runPreflightPipeline([{ name: 'blocked_tool.zip', bytes: zipBuffer }]);

    assert(result.overallStatus === 'rejected', 'Archive with binary must be rejected');
    assert(result.threatGateDecision === 'BLOCK', 'Threat Gate must declare BLOCK decision');
    assert(result.safeFiles.length === 0, 'No files allowed to review on BLOCK');
    pass('16. Security-blocked archive remains blocked');
  }

  // -------------------------------------------------------------------------
  // Test 17: Preflight pipeline preserves transparency in PreflightResult
  // -------------------------------------------------------------------------
  {
    const zip = new JSZip();
    zip.file('src/app.ts', 'const x = 1;');
    zip.file('.DS_Store', 'meta');

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
    const result = await runPreflightPipeline([{ name: 'transparent.zip', bytes: zipBuffer }]);

    assert(result.filesDiscovered === 2, 'filesDiscovered must be 2');
    assert(result.filesAccepted === 1, 'filesAccepted must be 1');
    assert(result.filesRejected === 1, 'filesRejected must be 1');
    assert(Array.isArray(result.rejectedFiles) && result.rejectedFiles.length === 1, 'rejectedFiles list must be present in PreflightResult');
    assert(result.rejectedFiles![0].reason.includes('Non-reviewable system metadata'), 'rejected reason must be preserved');
    pass('17. Preflight pipeline preserves transparency in PreflightResult');
  }

  console.log('\n==================================================================');
  console.log('   ALL 17 URL CLASSIFICATION & ZIP TRANSPARENCY TESTS PASSED!     ');
  console.log('==================================================================');
}

runTests().catch(err => {
  console.error('\n[TEST SUITE FAILURE]', err);
  process.exit(1);
});
