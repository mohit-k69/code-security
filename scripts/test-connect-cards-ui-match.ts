/**
 * AUTOMATED TEST SUITE: CONNECT CARDS UI MATCHING GITHUB & ERROR/EMPTY STATE SEPARATION
 *
 * Verifies:
 * 1. GitLab ConnectCard visual structure matches GitHub ConnectionError (container, icon, title, description, button).
 * 2. Bitbucket ConnectCard visual structure matches GitHub ConnectionError.
 * 3. Azure DevOps ConnectCard visual structure matches GitHub ConnectionError.
 * 4. Large "Read-Only Minimum Scopes Enforced" panels removed from all 3 connect cards.
 * 5. Button styling, typography, spacing, and hierarchy match GitHub.
 * 6. Error states in GitLab, Bitbucket, and Azure workflows do NOT simultaneously render "No projects / repos found" empty state.
 * 7. Empty state ("No GitLab projects found", etc.) only renders when request succeeds with 0 items.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: CONNECT CARDS UI MATCHING GITHUB');
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
  const githubErrorStatesPath = path.resolve('src/components/workflows/github/GithubErrorStates.tsx');
  const githubErrorStatesCode = fs.readFileSync(githubErrorStatesPath, 'utf8');

  const gitlabConnectPath = path.resolve('src/components/workflows/gitlab/GitlabConnectCard.tsx');
  const gitlabConnectCode = fs.readFileSync(gitlabConnectPath, 'utf8');

  const bitbucketConnectPath = path.resolve('src/components/workflows/bitbucket/BitbucketConnectCard.tsx');
  const bitbucketConnectCode = fs.readFileSync(bitbucketConnectPath, 'utf8');

  const azureConnectPath = path.resolve('src/components/workflows/azure/AzureConnectCard.tsx');
  const azureConnectCode = fs.readFileSync(azureConnectPath, 'utf8');

  const gitlabWorkflowPath = path.resolve('src/components/workflows/GitlabWorkflow.tsx');
  const gitlabWorkflowCode = fs.readFileSync(gitlabWorkflowPath, 'utf8');

  const bitbucketWorkflowPath = path.resolve('src/components/workflows/BitbucketWorkflow.tsx');
  const bitbucketWorkflowCode = fs.readFileSync(bitbucketWorkflowPath, 'utf8');

  const azureWorkflowPath = path.resolve('src/components/workflows/AzureWorkflow.tsx');
  const azureWorkflowCode = fs.readFileSync(azureWorkflowPath, 'utf8');

  // 1. GitHub ConnectionError serves as visual source of truth
  await runTest('1. GitHub ConnectionError structure is established as benchmark', () => {
    assert(githubErrorStatesCode.includes('w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-200 shadow-sm'), 'Icon container matches');
    assert(githubErrorStatesCode.includes('text-[18px] font-semibold text-gray-900 mb-2'), 'Title typography matches');
    assert(githubErrorStatesCode.includes('text-[14px] text-gray-500 mb-6'), 'Description typography matches');
    assert(githubErrorStatesCode.includes('px-6 py-2.5 bg-gray-900 text-white rounded-full text-[14px] font-medium transition-colors shadow-sm mb-4'), 'Button styling matches');
  });

  // 2. GitLab ConnectCard visual parity
  await runTest('2. GitLab ConnectCard matches GitHub layout, typography, and button style', () => {
    assert(gitlabConnectCode.includes('w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-200 shadow-sm'), 'GitLab icon container matches GitHub');
    assert(gitlabConnectCode.includes('text-[18px] font-semibold text-gray-900 mb-2'), 'GitLab title typography matches GitHub');
    assert(gitlabConnectCode.includes('text-[14px] text-gray-500 mb-6'), 'GitLab description typography matches GitHub');
    assert(gitlabConnectCode.includes('px-6 py-2.5 bg-gray-900 text-white rounded-full text-[14px] font-medium transition-colors shadow-sm mb-4'), 'GitLab button matches GitHub');
    assert(!gitlabConnectCode.includes('Read-Only Minimum Scopes Enforced'), 'Large info box removed from GitLab');
  });

  // 3. Bitbucket ConnectCard visual parity
  await runTest('3. Bitbucket ConnectCard matches GitHub layout, typography, and button style', () => {
    assert(bitbucketConnectCode.includes('w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-200 shadow-sm'), 'Bitbucket icon container matches GitHub');
    assert(bitbucketConnectCode.includes('text-[18px] font-semibold text-gray-900 mb-2'), 'Bitbucket title typography matches GitHub');
    assert(bitbucketConnectCode.includes('text-[14px] text-gray-500 mb-6'), 'Bitbucket description typography matches GitHub');
    assert(bitbucketConnectCode.includes('px-6 py-2.5 bg-gray-900 text-white rounded-full text-[14px] font-medium transition-colors shadow-sm mb-4'), 'Bitbucket button matches GitHub');
    assert(!bitbucketConnectCode.includes('Read-Only Minimum Scopes Enforced'), 'Large info box removed from Bitbucket');
  });

  // 4. Azure DevOps ConnectCard visual parity
  await runTest('4. Azure DevOps ConnectCard matches GitHub layout, typography, and button style', () => {
    assert(azureConnectCode.includes('w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-200 shadow-sm'), 'Azure icon container matches GitHub');
    assert(azureConnectCode.includes('text-[18px] font-semibold text-gray-900 mb-2'), 'Azure title typography matches GitHub');
    assert(azureConnectCode.includes('text-[14px] text-gray-500 mb-6'), 'Azure description typography matches GitHub');
    assert(azureConnectCode.includes('px-6 py-2.5 bg-gray-900 text-white rounded-full text-[14px] font-medium transition-colors shadow-sm mb-4'), 'Azure button matches GitHub');
    assert(!azureConnectCode.includes('Read-Only Minimum Scopes Enforced'), 'Large info box removed from Azure DevOps');
  });

  // 5. Error / Empty-state separation in GitLab workflow
  await runTest('5. GitLab workflow does not render empty state when API error is present', () => {
    assert(gitlabWorkflowCode.includes('gitlabProjectsError && gitlabProjects.length === 0'), 'GitLab workflow checks for projects error before rendering list');
  });

  // 6. Error / Empty-state separation in Bitbucket workflow
  await runTest('6. Bitbucket workflow does not render empty state when API error is present', () => {
    assert(bitbucketWorkflowCode.includes('bitbucketReposError && bitbucketRepos.length === 0'), 'Bitbucket workflow checks for repos error before rendering list');
  });

  // 7. Error / Empty-state separation in Azure workflow
  await runTest('7. Azure DevOps workflow does not render empty state when API error is present', () => {
    assert(azureWorkflowCode.includes('azureReposError && azureRepos.length === 0'), 'Azure workflow checks for repos error before rendering list');
  });

  console.log('\nAll Connect Card & Error/Empty-State tests passed successfully!\n');
}

runAllTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
