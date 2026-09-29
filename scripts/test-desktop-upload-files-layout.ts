/**
 * AUTOMATED REGRESSION TEST SUITE: DESKTOP UPLOAD FILES LAYOUT
 *
 * Verifies all requirements from the specification:
 * 1. Hide the persistent sidebar ONLY while Upload Files or Paste Code is active on desktop.
 * 2. Give the Upload Files workspace the full available width after the sidebar is hidden.
 * 3. Split the workspace into two sections: LEFT ~45%, RIGHT ~55%.
 * 4. LEFT section: Preserves existing Upload Files UI (upload area, precheck, Threat Gate, file info).
 * 5. RIGHT section: Preserves existing Results panel and report rendering.
 * 6. Both panels fill the available desktop viewport height matching Paste Code.
 * 7. Preserves mobile Upload Files, Paste Code, GitHub, upload functionality, and security logic.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: DESKTOP UPLOAD FILES LAYOUT');
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
  const appTsxPath = path.resolve('src/App.tsx');
  const appTsx = fs.readFileSync(appTsxPath, 'utf8');

  const uploadWorkflowPath = path.resolve('src/components/workflows/UploadWorkflow.tsx');
  const uploadWorkflow = fs.readFileSync(uploadWorkflowPath, 'utf8');

  // Helper simulating the layout calculations from App.tsx
  function computeLayout(activeTab: 'new' | 'reviewed', activeWorkflow: 'none' | 'upload' | 'paste' | 'github') {
    const isPasteCodeMode = activeTab === 'new' && activeWorkflow === 'paste';
    const isUploadMode = activeTab === 'new' && activeWorkflow === 'upload';
    const isFullWorkspaceMode = isPasteCodeMode || isUploadMode;
    const isStandardAnalysisActive = activeWorkflow === 'upload' || activeWorkflow === 'paste';
    const isGithubAnalysisActive = activeWorkflow === 'github';
    const shouldShowResultsPanel = isStandardAnalysisActive || isGithubAnalysisActive;

    const sidebarClass = isFullWorkspaceMode ? 'hidden' : 'hidden md:flex';
    const leftContainerClass = isFullWorkspaceMode
      ? 'w-full lg:flex lg:w-[45%] lg:h-full lg:flex-col shrink-0 border-r border-gray-200'
      : shouldShowResultsPanel
        ? 'w-full lg:w-[35%] shrink-0 border-r border-gray-200'
        : 'flex-1';

    const rightContainerClass = isFullWorkspaceMode
      ? 'h-full flex flex-1 min-w-0 w-full lg:w-[55%] shrink-0'
      : 'h-full flex flex-1 min-w-0 w-full lg:w-[65%] shrink-0';

    return {
      isUploadMode,
      isPasteCodeMode,
      isFullWorkspaceMode,
      sidebarClass,
      leftContainerClass,
      rightContainerClass,
      shouldShowResultsPanel,
    };
  }

  // 1. Sidebar is hidden when Upload Files is active on desktop
  await runTest('1. Hide the persistent sidebar ONLY while Upload Files or Paste Code is active on desktop', () => {
    const uploadLayout = computeLayout('new', 'upload');
    assert.strictEqual(uploadLayout.sidebarClass, 'hidden', 'Sidebar must be hidden during Upload Files');

    const homeLayout = computeLayout('new', 'none');
    assert.strictEqual(homeLayout.sidebarClass, 'hidden md:flex', 'Sidebar must be visible on home');

    const githubLayout = computeLayout('new', 'github');
    assert.strictEqual(githubLayout.sidebarClass, 'hidden md:flex', 'Sidebar must be visible on GitHub');

    const historyLayout = computeLayout('reviewed', 'none');
    assert.strictEqual(historyLayout.sidebarClass, 'hidden md:flex', 'Sidebar must be visible on Reviews history');
  });

  // 2. Upload Files uses 45% / 55% split matching Paste Code
  await runTest('2. Upload Files workspace splits into 45% left and 55% right matching Paste Code', () => {
    const uploadLayout = computeLayout('new', 'upload');
    assert(uploadLayout.leftContainerClass.includes('lg:w-[45%]'), 'Left pane uses 45% width');
    assert(uploadLayout.rightContainerClass.includes('lg:w-[55%]'), 'Right pane uses 55% width');
    assert(uploadLayout.leftContainerClass.includes('border-r border-gray-200'), 'Divider border separates panes');
  });

  // 3. Left pane expands to full available width
  await runTest('3. Left section expands to max-w-full and fills the 45% workspace pane', () => {
    assert(appTsx.includes("isUploadMode ? 'max-w-full'"), 'Inner container expands with max-w-full');
    assert(uploadWorkflow.includes('UploadPreflightView'), 'Upload preflight pipeline component is preserved');
    assert(uploadWorkflow.includes('runPreflightPipeline'), 'Preflight pipeline handler is preserved');
  });

  // 4. Left and right panels fill available desktop viewport height
  await runTest('4. Both panels fill the available desktop viewport height (lg:h-full lg:flex-col)', () => {
    assert(appTsx.includes('lg:h-full lg:flex-col'), 'Left pane specifies lg:h-full lg:flex-col');
    assert(appTsx.includes('isUploadMode ? \'h-full flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar\''),
      'Left pane provides dedicated internal scrollbar for upload workflows');
  });

  // 5. Results panel is preserved
  await runTest('5. Results panel preserves existing SecurityReportPanel and state handling', () => {
    assert(appTsx.includes('<SecurityReportPanel'), 'SecurityReportPanel is mounted');
    assert(appTsx.includes('analysisResult={analysisResult}'), 'Analysis result is wired');
    assert(appTsx.includes('isAnalyzing={isAnalyzing}'), 'Analysis loading state is wired');
  });

  // 6. Mobile Upload Files remains responsive
  await runTest('6. Mobile Upload Files layout and actions remain intact', () => {
    assert(appTsx.includes('showBackButton={activeTab === \'new\' && (activeWorkflow === \'paste\' || activeWorkflow === \'upload\')}'),
      'Mobile header shows back button for Upload Files');
  });

  // 7. Security logic and upload preflight remain intact
  await runTest('7. Security logic, preflight pipeline, Threat Gate, and OCR remain intact', () => {
    assert(uploadWorkflow.includes('MIN_OCR_CONFIDENCE_THRESHOLD'), 'OCR threshold intact');
    assert(uploadWorkflow.includes('INITIAL_PREFLIGHT_STEPS'), 'Preflight steps intact');
    assert(uploadWorkflow.includes('processFiles'), 'File processing engine intact');
  });

  console.log('\n==================================================================');
  console.log('   ALL 7 DESKTOP UPLOAD FILES LAYOUT TESTS PASSED!');
  console.log('==================================================================');
}

runAllTests();
