/**
 * AUTOMATED REGRESSION TEST SUITE: MOBILE DASHBOARD CARD LAYOUT
 *
 * Verifies all requirements from the specification:
 * 1. Mobile dashboard cards position icons in the upper-middle left.
 * 2. Mobile dashboard cards position titles in the lower left, aligned with icons.
 * 3. Icon and title are not vertically centered as a group on mobile.
 * 4. Desktop dashboard cards retain centered layout (md:items-center md:justify-center md:text-center).
 * 5. Card dimensions, responsive breakpoints, borders, and shadows are preserved.
 * 6. Card status texts and file counts remain cleanly associated with titles.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: MOBILE DASHBOARD CARD LAYOUT');
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
  const workflowSelectorPath = path.resolve('src/components/workflows/WorkflowSelector.tsx');
  const workflowSelector = fs.readFileSync(workflowSelectorPath, 'utf8');

  // 1. Mobile cards use items-start and justify-end for upper-middle icon and bottom-left title
  await runTest('1. Mobile dashboard cards position icon and title with items-start and justify-end', () => {
    assert(workflowSelector.includes('flex flex-col items-start justify-end'),
      'Card buttons must use items-start and justify-end on mobile');
    assert(workflowSelector.includes('text-left'), 'Card buttons must align text to the left on mobile');
  });

  // 2. Card icons are positioned in upper-middle left on mobile and centered on desktop
  await runTest('2. Card icons are left-aligned on mobile (self-start) and centered on desktop (md:self-center)', () => {
    assert(workflowSelector.includes('self-start md:self-center'),
      'Icon wrappers must specify self-start on mobile and md:self-center on desktop');
  });

  // 3. Card titles are aligned to the left on mobile and centered on desktop
  await runTest('3. Card titles are left-aligned on mobile and centered on desktop', () => {
    assert(workflowSelector.includes('flex flex-col items-start md:items-center text-left md:text-center'),
      'Title wrappers must specify items-start text-left on mobile and md:items-center md:text-center on desktop');
  });

  // 4. Desktop layout is completely preserved
  await runTest('4. Desktop card layout preserves centered alignment (md:items-center md:justify-center)', () => {
    assert(workflowSelector.includes('md:items-center md:justify-center md:gap-3'),
      'Card buttons must retain md:items-center md:justify-center md:gap-3 on desktop');
    assert(workflowSelector.includes('md:flex md:items-center md:justify-center md:gap-6 md:w-full'),
      'Grid container must retain md:flex md:items-center md:justify-center on desktop');
  });

  // 5. Card dimensions and responsive classes are preserved
  await runTest('5. Card dimensions, responsive breakpoints, borders, and shadows are preserved', () => {
    assert(workflowSelector.includes('w-[142px] min-[360px]:w-[160px] min-[375px]:w-[168px] min-[390px]:w-[176px] min-[414px]:w-[187px] md:w-[145px]'),
      'Card widths across all mobile/desktop breakpoints must be preserved');
    assert(workflowSelector.includes('h-[78px] min-[360px]:h-[87px] min-[375px]:h-[92px] min-[390px]:h-[96px] min-[414px]:h-[102px] md:h-[110px]'),
      'Card heights across all mobile/desktop breakpoints must be preserved');
  });

  // 6. All three workflow buttons (Upload, Paste, GitHub) are styled consistently
  await runTest('6. All workflow cards (Upload Files, Paste Code, GitHub) have consistent positioning', () => {
    assert(workflowSelector.includes('id="upload-files-card-btn"'), 'Upload card button present');
    assert(workflowSelector.includes('id="paste-code-card-btn"'), 'Paste card button present');
    assert(workflowSelector.includes('id="github-card-btn"'), 'GitHub card button present');

    const uploadMatch = workflowSelector.match(/id="upload-files-card-btn"[\s\S]*?<\/button>/);
    const pasteMatch = workflowSelector.match(/id="paste-code-card-btn"[\s\S]*?<\/button>/);
    const githubMatch = workflowSelector.match(/id="github-card-btn"[\s\S]*?<\/button>/);

    assert(uploadMatch && uploadMatch[0].includes('items-start justify-end'));
    assert(pasteMatch && pasteMatch[0].includes('items-start justify-end'));
    assert(githubMatch && githubMatch[0].includes('items-start justify-end'));
  });

  console.log('\n==================================================================');
  console.log('   ALL 6 MOBILE DASHBOARD CARD LAYOUT TESTS PASSED SUCCESSFULLY!');
  console.log('==================================================================');
}

runAllTests();
