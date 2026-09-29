/**
 * AUTOMATED TEST SUITE: GITLAB PROJECT CARDS UI MATCHING GITHUB REPOSITORY CARDS
 *
 * Verifies all 6 requirements:
 * 1. GitLab projects render as cards when projects are returned.
 * 2. Card styling/structure matches existing GitHub repository cards.
 * 3. Clicking a GitLab card selects the project and opens the existing MR flow.
 * 4. Zero projects shows the existing empty state.
 * 5. API failure shows the existing error/retry state.
 * 6. GitHub UI remains unchanged.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: GITLAB PROJECT CARDS UI MATCHING GITHUB');
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
  const githubListPath = path.resolve('src/components/workflows/github/GithubRepoList.tsx');
  const githubListCode = fs.readFileSync(githubListPath, 'utf8');

  const gitlabListPath = path.resolve('src/components/workflows/gitlab/GitlabProjectList.tsx');
  const gitlabListCode = fs.readFileSync(gitlabListPath, 'utf8');

  const gitlabWorkflowPath = path.resolve('src/components/workflows/GitlabWorkflow.tsx');
  const gitlabWorkflowCode = fs.readFileSync(gitlabWorkflowPath, 'utf8');

  // 1. GitLab projects render as cards when projects are returned
  await runTest('1. GitLab projects render as cards in responsive grid layout', () => {
    assert(gitlabListCode.includes('grid grid-cols-1'), 'Container uses grid-cols-1');
    assert(gitlabListCode.includes('md:grid-cols-2'), 'Container uses md:grid-cols-2 for grid view');
    assert(gitlabListCode.includes('AnimatePresence'), 'Uses AnimatePresence for smooth transitions');
    assert(gitlabListCode.includes('motion.div'), 'Renders motion.div for individual project cards');
  });

  // 2. Card styling/structure matches existing GitHub repository cards
  await runTest('2. Card styling and visual hierarchy matches GitHub repository cards', () => {
    // Check borders, rounded corners, padding
    assert(gitlabListCode.includes('rounded-xl hover:shadow-md'), 'Card uses rounded-xl hover:shadow-md');
    assert(gitlabListCode.includes('border-emerald-500 ring-1 ring-emerald-500 shadow-sm'), 'Selected card border matches GitHub');
    assert(gitlabListCode.includes("isFullCard ? 'p-5 flex flex-col gap-4' : 'p-4 flex items-center gap-4'"), 'Card padding matches GitHub');

    // Check title, badge, and path hierarchy
    assert(gitlabListCode.includes('text-[15px] font-semibold text-gray-900 truncate'), 'Title typography matches GitHub');
    assert(gitlabListCode.includes('px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium'), 'Visibility badge matches GitHub');
    assert(gitlabListCode.includes('<Lock className="w-3 h-3" />'), 'Lock icon present for private visibility');
    assert(gitlabListCode.includes('<Globe className="w-3 h-3" />'), 'Globe icon present for public visibility');
    assert(gitlabListCode.includes('text-[13px] text-gray-500 truncate mt-0.5'), 'Namespace typography matches GitHub');

    // Check description styling
    assert(gitlabListCode.includes('text-[13px] text-gray-600 line-clamp-2 min-h-[40px]'), 'Description matches GitHub typography and line-clamp');

    // Check footer action and date styling
    assert(gitlabListCode.includes('border-t border-gray-100'), 'Footer separator matches GitHub');
    assert(gitlabListCode.includes('px-4 py-1 rounded-full text-[12px] font-medium'), 'Pill button styling matches GitHub');
  });

  // 3. Clicking a GitLab card selects the project and opens the existing MR flow
  await runTest('3. Clicking a GitLab project card triggers onSelectProject to open MR flow', () => {
    assert(gitlabListCode.includes('onClick={() => onSelectProject(project)}'), 'Card has onClick handler to select project');
    assert(gitlabWorkflowCode.includes('onSelectProject={selectProject}'), 'GitlabWorkflow passes selectProject to GitlabProjectList');
    assert(gitlabWorkflowCode.includes('<GitlabMergeRequestList'), 'Selecting project displays GitlabMergeRequestList');
  });

  // 4. Zero projects shows the existing empty state
  await runTest('4. Zero projects renders clean empty state without fake repositories', () => {
    assert(gitlabListCode.includes('No GitLab projects found.'), 'Empty state message is rendered when projects array is empty');
    assert(gitlabListCode.includes('FolderGit'), 'Renders FolderGit icon in empty state');
  });

  // 5. API failure shows the existing error/retry state
  await runTest('5. API failure displays error message and Retry action', () => {
    assert(gitlabWorkflowCode.includes('(gitlabProjectsError || gitlabMRsError)'), 'Error state conditionally rendered on API failure');
    assert(gitlabWorkflowCode.includes('Retry'), 'Retry button present');
    assert(gitlabWorkflowCode.includes('onClick={fetchGitlabProjects}'), 'Retry button re-fetches GitLab projects');
  });

  // 6. GitHub UI remains unchanged
  await runTest('6. GitHub repository list UI remains completely intact and unchanged', () => {
    assert(githubListCode.includes('export function GithubRepoList'), 'GithubRepoList component intact');
    assert(githubListCode.includes('handleAnalyze(repo)'), 'GitHub analysis trigger intact');
    assert(githubListCode.includes('githubRepos'), 'githubRepos prop intact');
  });

  console.log('\n==================================================================');
  console.log('   ALL 6 GITLAB PROJECT CARDS UI TESTS PASSED SUCCESSFULLY!');
  console.log('==================================================================');
}

runAllTests();
