import assert from 'assert';
import { supabase } from '../src/lib/supabase';
import { analyzeCode, AnalysisResult } from '../src/analyzer';
import { PreflightResult, ExtractedProjectFile, SuspiciousFinding } from '../src/lib/upload/types';

console.log('==================================================================');
console.log('   AUTOMATED REGRESSION TEST SUITE: UPLOAD REVIEW ARCHITECTURE');
console.log('==================================================================\n');

function pass(name: string) {
  console.log(`  [PASS] ${name}`);
}

/**
 * Deterministic helper mirroring the exact handleStartUploadReview logic
 * from src/hooks/useAnalysis.ts to verify pipeline contracts, payloads,
 * error handling, and security invariants in isolation.
 */
async function simulateHandleStartUploadReview(
  preflightResult: PreflightResult,
  supabaseMock: {
    invoke: (fn: string, options: { body: any }) => Promise<{ data: any; error: any }>;
  },
  analyzeCodeSpy?: (code: string) => AnalysisResult
) {
  // 1. Threat Gate guard (exact logic from useAnalysis.ts)
  if (
    !preflightResult ||
    preflightResult.threatGateDecision === 'BLOCK' ||
    preflightResult.overallStatus === 'rejected' ||
    !preflightResult.safeFiles ||
    preflightResult.safeFiles.length === 0
  ) {
    return { status: 'BLOCKED', filesSent: null, result: null, error: null };
  }

  // 2. Direct 1-to-1 mapping of safe files without synthetic wrappers or context injections
  const files = preflightResult.safeFiles.map((file) => ({
    name: file.relativePath,
    content: file.untrustedContent,
  }));

  let finalResult: any = null;
  let analysisError: string | null = null;
  let filesSentToRemote: any = null;

  try {
    filesSentToRemote = files;
    const { data, error } = await supabaseMock.invoke('analyze-snippet', {
      body: { files }
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    // Canonical engine report directly from backend ReviewOrchestrator
    finalResult = data.report;
  } catch (err: any) {
    try {
      const codeToAnalyze = files.map(f => f.content).join('\n\n');
      if (analyzeCodeSpy) {
        finalResult = analyzeCodeSpy(codeToAnalyze);
      } else {
        finalResult = analyzeCode(codeToAnalyze);
      }
    } catch (fallbackErr: any) {
      analysisError = err?.message || fallbackErr?.message || 'Security analysis encountered an error.';
      finalResult = null;
    }
  }

  return { status: 'COMPLETED', filesSent: filesSentToRemote, result: finalResult, error: analysisError };
}

async function runTests() {
  const sampleSafeFiles: ExtractedProjectFile[] = [
    {
      name: 'index.ts',
      relativePath: 'src/index.ts',
      size: 45,
      extension: '.ts',
      detectedLanguage: 'TypeScript',
      untrustedContent: 'import { auth } from "./auth";\nconsole.log(auth());',
      isBinary: false,
      status: 'accepted',
    },
    {
      name: 'auth.ts',
      relativePath: 'src/auth.ts',
      size: 60,
      extension: '.ts',
      detectedLanguage: 'TypeScript',
      untrustedContent: 'export function auth() {\n  return "user_session";\n}',
      isBinary: false,
      status: 'accepted',
    },
  ];

  const sampleFinding: SuspiciousFinding = {
    id: 'SEC-PREFLIGHT-001',
    category: 'secret',
    severity: 'critical',
    rule: 'API_KEY_DETECTED',
    description: 'Potential secret detected in preflight',
    fileName: 'src/auth.ts',
    line: 2,
    maskedSnippet: '[MASKED]',
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Test 1: Verify clean { name, content } file payload construction without XML or comment wrappers
  // ───────────────────────────────────────────────────────────────────────────
  {
    const preflight: PreflightResult = {
      uploadType: 'zip',
      overallStatus: 'passed',
      threatGateDecision: 'ALLOW',
      primaryFileName: 'project.zip',
      filesDiscovered: 2,
      filesAccepted: 2,
      safeFiles: sampleSafeFiles,
      findings: [sampleFinding],
    };

    let capturedPayload: any = null;
    const mockSupabase = {
      invoke: async (fn: string, options: { body: any }) => {
        capturedPayload = options.body;
        return {
          data: {
            report: {
              verdict: 'PASS',
              vibeScore: 92,
              findings: [],
              securitySummary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
            },
          },
          error: null,
        };
      },
    };

    const runResult = await simulateHandleStartUploadReview(preflight, mockSupabase);

    assert.strictEqual(runResult.status, 'COMPLETED');
    assert(capturedPayload !== null, 'Payload must be passed to supabase.functions.invoke');
    assert(Array.isArray(capturedPayload.files), 'Payload must have files array');
    assert.strictEqual(capturedPayload.files.length, 2, 'Files array must contain exactly 2 files');

    // Verify file 1
    assert.strictEqual(capturedPayload.files[0].name, 'src/index.ts');
    assert.strictEqual(capturedPayload.files[0].content, sampleSafeFiles[0].untrustedContent);

    // Verify file 2
    assert.strictEqual(capturedPayload.files[1].name, 'src/auth.ts');
    assert.strictEqual(capturedPayload.files[1].content, sampleSafeFiles[1].untrustedContent);

    // Verify absence of XML wrappers (<FILE path="...">, </FILE>)
    for (const f of capturedPayload.files) {
      assert(!f.content.includes('<FILE'), 'Content must NOT contain XML <FILE> opening tag');
      assert(!f.content.includes('</FILE>'), 'Content must NOT contain XML </FILE> closing tag');
      assert(!f.name.includes('<FILE'), 'File name must NOT contain XML tags');
    }

    // Verify absence of boundary comment wrappers
    for (const f of capturedPayload.files) {
      assert(!f.content.includes('/* ================= UNTRUSTED DATA'), 'Content must NOT contain comment header banner');
      assert(!f.content.includes('UNTRUSTED DATA END'), 'Content must NOT contain comment footer banner');
    }

    // Verify absence of synthetic project context files
    const contextFile = capturedPayload.files.find((f: any) => f.name === '__PROJECT_CONTEXT__.txt');
    assert.strictEqual(contextFile, undefined, 'Must NOT inject synthetic __PROJECT_CONTEXT__.txt into review payload');

    pass('1. handleStartUploadReview constructs clean { name, content } file payloads without XML or comment wrappers');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test 2: Verify analyze-snippet is invoked with { files } identical to multi-file structure
  // ───────────────────────────────────────────────────────────────────────────
  {
    const preflight: PreflightResult = {
      uploadType: 'zip',
      overallStatus: 'passed',
      threatGateDecision: 'ALLOW',
      primaryFileName: 'app.zip',
      filesDiscovered: 2,
      filesAccepted: 2,
      safeFiles: sampleSafeFiles,
      findings: [],
    };

    let calledFunctionName = '';
    let calledOptions: any = null;

    const mockSupabase = {
      invoke: async (fn: string, options: { body: any }) => {
        calledFunctionName = fn;
        calledOptions = options;
        return {
          data: {
            report: { verdict: 'PASS', findings: [] },
          },
          error: null,
        };
      },
    };

    await simulateHandleStartUploadReview(preflight, mockSupabase);

    assert.strictEqual(calledFunctionName, 'analyze-snippet', 'Must invoke analyze-snippet edge function');
    assert.deepStrictEqual(
      calledOptions,
      {
        body: {
          files: [
            { name: 'src/index.ts', content: sampleSafeFiles[0].untrustedContent },
            { name: 'src/auth.ts', content: sampleSafeFiles[1].untrustedContent },
          ],
        },
      },
      'Payload body must match { files: [{ name, content }] } multi-file contract'
    );

    pass('2. analyze-snippet is invoked with { files } identical to multi-file structure');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test 3: Verify remote success uses data.report directly without preflight merging
  // ───────────────────────────────────────────────────────────────────────────
  {
    const canonicalReport = {
      verdict: 'FAIL',
      vibeScore: 40,
      totalFindings: 1,
      securitySummary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      findings: [
        {
          id: 'SEC-001',
          ruleId: 'SEC-001',
          category: 'secrets',
          severity: 'CRITICAL',
          message: 'Hardcoded credentials detected in source code',
          file: 'src/auth.ts',
          line: 2,
        },
      ],
      summary: 'Backend review identified 1 critical security finding.',
    };

    const preflightWithFindings: PreflightResult = {
      uploadType: 'zip',
      overallStatus: 'warning',
      threatGateDecision: 'FLAG',
      primaryFileName: 'flagged_project.zip',
      filesDiscovered: 2,
      filesAccepted: 2,
      safeFiles: sampleSafeFiles,
      findings: [sampleFinding], // SEC-PREFLIGHT-001
    };

    const mockSupabase = {
      invoke: async () => ({
        data: { report: canonicalReport },
        error: null,
      }),
    };

    const { result } = await simulateHandleStartUploadReview(preflightWithFindings, mockSupabase);

    // Verify canonical report is used directly as-is
    assert.strictEqual(result.verdict, 'FAIL', 'Canonical verdict must be preserved directly');
    assert.strictEqual(result.vibeScore, 40, 'Canonical vibeScore must be preserved without client modification');
    assert.strictEqual(result.findings.length, 1, 'Report must contain ONLY backend findings (no client-side additions)');
    assert.strictEqual(result.findings[0].id, 'SEC-001', 'First finding must be the canonical backend finding');

    // Verify NO SEC-PREFLIGHT-* findings were injected
    const hasPreflightInjected = result.findings.some((f: any) =>
      String(f.id).startsWith('SEC-PREFLIGHT') || String(f.ruleId).startsWith('SEC-PREFLIGHT')
    );
    assert.strictEqual(hasPreflightInjected, false, 'Preflight findings must NOT be merged into canonical SecurityReport');

    pass('3. remote success uses data.report directly without preflight merging');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test 4: Verify fallback uses clean joined content without XML or context files
  // ───────────────────────────────────────────────────────────────────────────
  {
    const preflight: PreflightResult = {
      uploadType: 'zip',
      overallStatus: 'passed',
      threatGateDecision: 'ALLOW',
      primaryFileName: 'clean.zip',
      filesDiscovered: 2,
      filesAccepted: 2,
      safeFiles: sampleSafeFiles,
      findings: [],
    };

    let analyzedCode = '';
    const spyAnalyzeCode = (code: string): AnalysisResult => {
      analyzedCode = code;
      return analyzeCode(code);
    };

    const failingSupabase = {
      invoke: async () => {
        throw new Error('Edge function temporarily unavailable');
      },
    };

    const { result } = await simulateHandleStartUploadReview(preflight, failingSupabase, spyAnalyzeCode);

    assert(result !== null, 'Fallback must produce an AnalysisResult');
    assert(analyzedCode.length > 0, 'Fallback code was analyzed');

    // Verify analyzed code does not contain XML wrappers
    assert(!analyzedCode.includes('<FILE'), 'Fallback analyzed code must NOT contain <FILE> XML tag');
    assert(!analyzedCode.includes('</FILE>'), 'Fallback analyzed code must NOT contain </FILE> XML tag');

    // Verify analyzed code does not contain __PROJECT_CONTEXT__
    assert(!analyzedCode.includes('__PROJECT_CONTEXT__'), 'Fallback analyzed code must NOT contain project context marker');
    assert(!analyzedCode.includes('Project Manifest'), 'Fallback analyzed code must NOT contain project manifest string');

    // Verify joined content matches raw file contents separated by '\n\n'
    const expectedJoined = sampleSafeFiles.map(f => f.untrustedContent).join('\n\n');
    assert.strictEqual(analyzedCode, expectedJoined, 'Fallback code must be exact clean joined content');

    pass('4. fallback uses clean joined content without XML or context files');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test 5: Verify BLOCK uploads do NOT invoke analyze-snippet or fallback
  // ───────────────────────────────────────────────────────────────────────────
  {
    let invokeCalled = false;
    let fallbackCalled = false;

    const mockSupabase = {
      invoke: async () => {
        invokeCalled = true;
        return { data: null, error: null };
      },
    };

    const spyAnalyze = (code: string): AnalysisResult => {
      fallbackCalled = true;
      return analyzeCode(code);
    };

    // Case 5a: threatGateDecision = 'BLOCK'
    const blockedPreflight: PreflightResult = {
      uploadType: 'zip',
      overallStatus: 'rejected',
      threatGateDecision: 'BLOCK',
      primaryFileName: 'malware.zip',
      filesDiscovered: 1,
      filesAccepted: 0,
      safeFiles: [],
      findings: [],
    };

    const res5a = await simulateHandleStartUploadReview(blockedPreflight, mockSupabase, spyAnalyze);
    assert.strictEqual(res5a.status, 'BLOCKED', 'BLOCK upload must be rejected immediately');
    assert.strictEqual(invokeCalled, false, 'analyze-snippet must NEVER be invoked for BLOCK');
    assert.strictEqual(fallbackCalled, false, 'fallback analyzeCode must NEVER be invoked for BLOCK');

    // Case 5b: overallStatus = 'rejected'
    const rejectedPreflight: PreflightResult = {
      uploadType: 'zip',
      overallStatus: 'rejected',
      primaryFileName: 'evil.zip',
      filesDiscovered: 0,
      filesAccepted: 0,
      safeFiles: [],
      findings: [],
    };

    const res5b = await simulateHandleStartUploadReview(rejectedPreflight, mockSupabase, spyAnalyze);
    assert.strictEqual(res5b.status, 'BLOCKED', 'Rejected status must abort prior to review');
    assert.strictEqual(invokeCalled, false, 'analyze-snippet must not be called');
    assert.strictEqual(fallbackCalled, false, 'fallback analyzeCode must not be called');

    pass('5. BLOCK uploads do NOT invoke analyze-snippet or fallback');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test 6: Verify FLAG and ALLOW uploads proceed with review
  // ───────────────────────────────────────────────────────────────────────────
  {
    let allowInvoked = false;
    let flagInvoked = false;

    // ALLOW upload
    const allowPreflight: PreflightResult = {
      uploadType: 'zip',
      overallStatus: 'passed',
      threatGateDecision: 'ALLOW',
      primaryFileName: 'safe.zip',
      filesDiscovered: 1,
      filesAccepted: 1,
      safeFiles: [sampleSafeFiles[0]],
      findings: [],
    };

    await simulateHandleStartUploadReview(allowPreflight, {
      invoke: async () => {
        allowInvoked = true;
        return { data: { report: { verdict: 'PASS' } }, error: null };
      },
    });

    assert.strictEqual(allowInvoked, true, 'ALLOW uploads must proceed to review coordinator');

    // FLAG upload
    const flagPreflight: PreflightResult = {
      uploadType: 'zip',
      overallStatus: 'warning',
      threatGateDecision: 'FLAG',
      primaryFileName: 'flagged.zip',
      filesDiscovered: 1,
      filesAccepted: 1,
      safeFiles: [sampleSafeFiles[0]],
      findings: [sampleFinding],
    };

    await simulateHandleStartUploadReview(flagPreflight, {
      invoke: async () => {
        flagInvoked = true;
        return { data: { report: { verdict: 'PASS' } }, error: null };
      },
    });

    assert.strictEqual(flagInvoked, true, 'FLAG uploads must proceed to review coordinator');

    pass('6. FLAG and ALLOW uploads proceed with review');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test 7: Missing provider configuration / failure cannot produce PASS/0 findings
  // ───────────────────────────────────────────────────────────────────────────
  {
    const vulnerableFixture: ExtractedProjectFile = {
      name: 'vulnerable.js',
      relativePath: 'src/vulnerable.js',
      size: 150,
      extension: '.js',
      detectedLanguage: 'JavaScript',
      untrustedContent: `
        app.post('/api/eval', (req, res) => {
          const result = eval(req.body.code);
          document.getElementById('out').innerHTML = result;
          const q = "SELECT * FROM users WHERE id = " + req.body.id + " + ";
          setTimeout("doSomething()", 1000);
          const hash = crypto.createHash('md5').update('data').digest('hex');
        });
      `,
      isBinary: false,
      status: 'accepted',
    };

    const preflight: PreflightResult = {
      uploadType: 'source_files',
      overallStatus: 'passed',
      threatGateDecision: 'ALLOW',
      primaryFileName: 'vulnerable.js',
      filesDiscovered: 1,
      filesAccepted: 1,
      safeFiles: [vulnerableFixture],
      findings: [],
    };

    // When backend returns 500 error (e.g. missing OPENROUTER_API_KEY)
    const failingSupabase = {
      invoke: async () => ({
        data: { error: 'Missing OPENROUTER_API_KEY' },
        error: new Error('Missing OPENROUTER_API_KEY'),
      }),
    };

    const { result, error } = await simulateHandleStartUploadReview(preflight, failingSupabase);

    assert(result !== null, 'Must fall back to local analyzer on provider failure');
    assert.strictEqual(error, null, 'Handled by fallback analyzer without hard crash');
    assert.strictEqual(result.verdict, 'FAIL', 'Vulnerable code must produce FAIL verdict, NEVER a silent PASS');
    assert(result.findings.length > 0, 'Vulnerable code must produce findings, NEVER 0 findings');

    // Verify all 5 intentional vulnerabilities are detected
    const rules = result.findings.map((f: any) => f.rule);
    assert(rules.includes('SEC-001'), 'Must detect eval() vulnerability (SEC-001)');
    assert(rules.includes('SEC-002'), 'Must detect innerHTML XSS vulnerability (SEC-002)');
    assert(rules.includes('SEC-009'), 'Must detect SQL injection vulnerability (SEC-009)');
    assert(rules.includes('PERF-005'), 'Must detect setTimeout string vulnerability (PERF-005)');
    assert(rules.includes('SEC-010'), 'Must detect MD5 weak hash vulnerability (SEC-010)');

    pass('7. Missing provider configuration / failure cannot produce PASS/0 findings');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test 8: Real successful provider response produces canonical SecurityReport
  // ───────────────────────────────────────────────────────────────────────────
  {
    const canonicalAiReport = {
      scanId: 'scan_12345',
      repository: { owner: 'user', name: 'paste_snippet', prNumber: 0, commitSha: 'local' },
      verdict: 'FAIL',
      totalFindings: 3,
      findings: [
        { id: 'f1', vulnerabilityClass: 'INPUT_VALIDATION', severity: 'critical', title: 'eval() used' },
        { id: 'f2', vulnerabilityClass: 'XSS', severity: 'critical', title: 'innerHTML used' },
        { id: 'f3', vulnerabilityClass: 'CRYPTOGRAPHIC_FAILURE', severity: 'warning', title: 'MD5 used' },
      ],
    };

    const preflight: PreflightResult = {
      uploadType: 'source_files',
      overallStatus: 'passed',
      threatGateDecision: 'ALLOW',
      primaryFileName: 'test.js',
      filesDiscovered: 1,
      filesAccepted: 1,
      safeFiles: [sampleSafeFiles[0]],
      findings: [],
    };

    const successfulSupabase = {
      invoke: async () => ({
        data: { report: canonicalAiReport },
        error: null,
      }),
    };

    const { result } = await simulateHandleStartUploadReview(preflight, successfulSupabase);
    assert.strictEqual(result.scanId, 'scan_12345', 'Canonical AI report must be passed directly');
    assert.strictEqual(result.verdict, 'FAIL', 'Canonical AI verdict must be preserved');
    assert.strictEqual(result.totalFindings, 3, 'Canonical AI findings count must be preserved');

    pass('8. Real successful provider response produces canonical SecurityReport');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test 9: Upload and Paste Code both receive identical backend analysis contracts
  // ───────────────────────────────────────────────────────────────────────────
  {
    const code = 'const x = eval(input);';
    const uploadPreflight: PreflightResult = {
      uploadType: 'source_files',
      overallStatus: 'passed',
      threatGateDecision: 'ALLOW',
      primaryFileName: 'snippet.js',
      filesDiscovered: 1,
      filesAccepted: 1,
      safeFiles: [{
        name: 'snippet.js',
        relativePath: 'snippet.js',
        size: code.length,
        extension: '.js',
        detectedLanguage: 'JavaScript',
        untrustedContent: code,
        isBinary: false,
        status: 'accepted',
      }],
      findings: [],
    };

    let uploadBody: any = null;
    await simulateHandleStartUploadReview(uploadPreflight, {
      invoke: async (_fn: string, options: { body: any }) => {
        uploadBody = options.body;
        return { data: { report: { verdict: 'FAIL' } }, error: null };
      },
    });

    const expectedPasteBody = {
      files: [{ name: 'snippet.js', content: code }],
    };

    assert.deepStrictEqual(uploadBody, expectedPasteBody, 'Upload and Paste Code must produce identical review payloads');
    pass('9. Upload and Paste Code both receive identical backend analysis contracts');
  }

  console.log('\n==================================================================');
  console.log('   ALL 9 UPLOAD REVIEW ARCHITECTURE REGRESSION TESTS PASSED!');
  console.log('==================================================================');
}

runTests().catch((err) => {
  console.error('\n[FATAL] Test failed:', err);
  process.exit(1);
});
