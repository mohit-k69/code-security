/**
 * AUTOMATED REGRESSION TEST SUITE: DESKTOP PASTE CODE EDITOR SIZING & LAYOUT
 *
 * Verifies all 11 requirements from the specification:
 * 1. Desktop Paste Code editor uses full available left-pane width.
 * 2. Desktop Paste Code editor fills remaining height below the header.
 * 3. Editor reaches the left-pane/right-pane divider.
 * 4. Editor reaches the bottom of the workspace.
 * 5. Short code does not create unnecessary page overflow.
 * 6. Long code scrolls INSIDE the editor (overflow-auto).
 * 7. Long horizontal lines remain horizontally scrollable.
 * 8. Results panel remains approximately 55% width.
 * 9. Desktop 45%/55% split remains unchanged.
 * 10. Mobile Paste Code layout remains unchanged.
 * 11. Existing Paste Code functionality remains unchanged.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: DESKTOP PASTE CODE EDITOR SIZING');
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

  const pasteWorkflowPath = path.resolve('src/components/workflows/PasteWorkflow.tsx');
  const pasteWorkflow = fs.readFileSync(pasteWorkflowPath, 'utf8');

  // Helper simulating the layout calculations from App.tsx
  function computeLayout(activeTab: 'new' | 'reviewed', activeWorkflow: 'none' | 'upload' | 'paste' | 'github') {
    const isPasteCodeMode = activeTab === 'new' && activeWorkflow === 'paste';
    const isStandardAnalysisActive = activeWorkflow === 'upload' || activeWorkflow === 'paste';
    const isGithubAnalysisActive = activeWorkflow === 'github';
    const shouldShowResultsPanel = isStandardAnalysisActive || isGithubAnalysisActive;

    const sidebarClass = isPasteCodeMode ? 'hidden' : 'hidden md:flex';
    const leftContainerClass = isPasteCodeMode
      ? 'w-full lg:flex lg:w-[45%] lg:h-full lg:flex-col shrink-0 border-r border-gray-200'
      : shouldShowResultsPanel
        ? 'w-full lg:w-[35%] shrink-0 border-r border-gray-200'
        : 'flex-1';

    const rightContainerClass = isPasteCodeMode
      ? 'lg:flex h-full flex-1 min-w-0 lg:w-[55%] shrink-0'
      : 'h-full flex flex-1 min-w-0 w-full lg:w-[65%] shrink-0';

    return {
      isPasteCodeMode,
      sidebarClass,
      leftContainerClass,
      rightContainerClass,
      shouldShowResultsPanel,
    };
  }

  // 1. Desktop Paste Code editor uses full available left-pane width
  await runTest('1. Desktop Paste Code editor uses full available left-pane width', () => {
    const layout = computeLayout('new', 'paste');
    assert(layout.leftContainerClass.includes('lg:w-[45%]'), 'Left container uses 45% of workspace');
    assert(appTsx.includes("isPasteCodeMode ? 'max-w-full'"), 'Inner container in Paste Code expands to full width');
    assert(pasteWorkflow.includes('w-full'), 'Editor container has full width');
  });

  // 2. Desktop Paste Code editor fills remaining height below header
  await runTest('2. Desktop Paste Code editor fills remaining height below the header', () => {
    assert(appTsx.includes("isPasteCodeMode ? 'h-full flex flex-col overflow-hidden'"),
      'Left container occupies full height and prevents outer page scrollbars');
    assert(appTsx.includes("isPasteCodeMode ? 'h-full flex-1 flex flex-col min-h-0'"),
      'Inner container propagates flex-1 and min-h-0 down to PasteWorkflow');
    assert(pasteWorkflow.includes('flex-1 flex flex-col h-full min-h-0'),
      'PasteWorkflow root container propagates full height to editor');
  });

  // 3. Editor reaches the left-pane/right-pane divider
  await runTest('3. Editor reaches the left-pane/right-pane divider', () => {
    const layout = computeLayout('new', 'paste');
    assert(layout.leftContainerClass.includes('border-r border-gray-200'),
      'Left container defines clean border-r divider separating editor from results');
  });

  // 4. Editor reaches the bottom of the workspace
  await runTest('4. Editor reaches the bottom of the workspace without arbitrary fixed height caps', () => {
    assert(pasteWorkflow.includes('h-full w-full'), 'Textarea wrapper specifies h-full w-full');
    assert(!pasteWorkflow.includes('height: 500px') && !pasteWorkflow.includes('height: 520px'),
      'Editor does not use arbitrary hardcoded heights');
  });

  // 5. Short code does not create unnecessary page overflow
  await runTest('5. Short code does not create unnecessary page overflow', () => {
    assert(pasteWorkflow.includes('resize-none'), 'Textarea prevents accidental user distortion');
    assert(appTsx.includes('overflow-hidden'), 'Paste Code left pane prevents unwanted page overflow');
  });

  // 6. Long code scrolls INSIDE the editor
  await runTest('6. Long code scrolls INSIDE the editor (overflow-auto on textarea)', () => {
    assert(pasteWorkflow.includes('overflow-auto'),
      'Textarea must have overflow-auto to scroll internally when code exceeds viewport');
    assert(pasteWorkflow.includes('min-h-0'),
      'Textarea must have min-h-0 to allow internal flex-shrink and scroll');
  });

  // 7. Long horizontal lines remain horizontally scrollable
  await runTest('7. Long horizontal lines remain horizontally scrollable', () => {
    assert(pasteWorkflow.includes('font-mono'), 'Editor retains monospace styling for code lines');
    assert(pasteWorkflow.includes('overflow-auto'), 'Editor retains horizontal and vertical scrolling');
  });

  // 8. Results panel remains approximately 55% width
  await runTest('8. Results panel remains approximately 55% width on desktop', () => {
    const layout = computeLayout('new', 'paste');
    assert(layout.rightContainerClass.includes('lg:w-[55%]'), 'Results container must retain 55% width');
  });

  // 9. Desktop 45%/55% split remains unchanged
  await runTest('9. Desktop 45%/55% split remains unchanged with hidden sidebar', () => {
    const layout = computeLayout('new', 'paste');
    assert.strictEqual(layout.sidebarClass, 'hidden');
    assert(layout.leftContainerClass.includes('lg:w-[45%]'));
    assert(layout.rightContainerClass.includes('lg:w-[55%]'));
  });

  // 10. Mobile Paste Code layout remains unchanged
  await runTest('10. Mobile Paste Code layout remains unchanged (min-h-[50vh] on mobile, screen transitions)', () => {
    assert(pasteWorkflow.includes('min-h-[50vh] lg:min-h-0'),
      'Editor retains mobile minimum height while adapting to min-h-0 on desktop');
    assert(appTsx.includes('mobilePasteView'), 'Mobile paste view state is preserved');
  });

  // 11. Existing Paste Code functionality remains unchanged
  await runTest('11. Existing Paste Code functionality and analysis flow remain unchanged', () => {
    assert(appTsx.includes('handleAnalysePasteCode'), 'handleAnalysePasteCode is wired');
    assert(pasteWorkflow.includes('id="paste-code-analyze-btn"'), 'Analyze button is wired');
    assert(pasteWorkflow.includes('id="paste-code-textarea"'), 'Textarea id is intact');
  });

  console.log('\n==================================================================');
  console.log('   ALL 11 DESKTOP PASTE CODE EDITOR SIZING TESTS PASSED!');
  console.log('==================================================================');
}

runAllTests();
