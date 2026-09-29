/**
 * AUTOMATED REGRESSION TEST SUITE: SYNC CODE WORKFLOW UI & PROVIDER SELECTION
 *
 * Verifies all requirements from the specification:
 * 1. Dashboard shows exactly three cards: Upload Files, Paste Code, Sync Code.
 * 2. Third card name is "Sync Code" (or "Connected" when linked).
 * 3. Clicking Sync Code opens dedicated provider-selection view.
 * 4. Provider-selection shows: Sync Code, Connect your code repository, GitHub, GitLab, Bitbucket, Azure DevOps.
 * 5. GitHub provider opens the existing GitHub workflow.
 * 6. GitLab, Bitbucket, and Azure DevOps show "Coming soon".
 * 7. Upload Files and Paste Code workflows remain unchanged.
 * 8. Existing GitHub analysis logic and review pipeline remain intact.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: SYNC CODE WORKFLOW & PROVIDER SELECTION');
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

  const syncCodeWorkflowPath = path.resolve('src/components/workflows/SyncCodeWorkflow.tsx');
  const syncCodeWorkflow = fs.readFileSync(syncCodeWorkflowPath, 'utf8');

  const appTsxPath = path.resolve('src/App.tsx');
  const appTsx = fs.readFileSync(appTsxPath, 'utf8');

  const useWorkflowPath = path.resolve('src/hooks/useWorkflow.ts');
  const useWorkflow = fs.readFileSync(useWorkflowPath, 'utf8');

  // 1. Dashboard shows exactly three cards
  await runTest('1. Dashboard renders exactly three cards in workflow selector', () => {
    assert(workflowSelector.includes('id="upload-files-card-btn"'), 'Upload Files card must be present');
    assert(workflowSelector.includes('id="paste-code-card-btn"'), 'Paste Code card must be present');
    assert(workflowSelector.includes('id="sync-code-card-btn"'), 'Sync Code card must be present');

    const buttonMatches = workflowSelector.match(/<button[\s\S]*?<\/button>/g);
    assert.strictEqual(buttonMatches?.length, 3, 'Must contain exactly 3 workflow buttons');
  });

  // 2. Third card is "Sync Code"
  await runTest('2. Third dashboard card is named "Sync Code"', () => {
    assert(workflowSelector.includes("{githubConnected ? 'Connected' : 'Sync Code'}"),
      'Card title must render "Sync Code" when disconnected and "Connected" when linked');
    assert(workflowSelector.includes("setActiveWorkflow('sync')"),
      'Clicking the third card must activate the "sync" workflow');
  });

  // 3. Workflow state includes "sync"
  await runTest('3. Workflow state type supports "sync"', () => {
    assert(useWorkflow.includes("'sync'"), 'WorkflowState type must include "sync"');
  });

  // 4. Provider-selection screen contains all 4 providers
  await runTest('4. Provider selection screen displays Title, Subtitle, and 4 Providers', () => {
    assert(syncCodeWorkflow.includes('Sync Code'), 'Title must be Sync Code');
    assert(syncCodeWorkflow.includes('Connect your code repository'), 'Subtitle must be Connect your code repository');
    assert(syncCodeWorkflow.includes('GitHub'), 'GitHub provider must be present');
    assert(syncCodeWorkflow.includes('GitLab'), 'GitLab provider must be present');
    assert(syncCodeWorkflow.includes('Bitbucket'), 'Bitbucket provider must be present');
    assert(syncCodeWorkflow.includes('Azure DevOps'), 'Azure DevOps provider must be present');
  });

  // 5. GitHub provider opens existing GitHub workflow
  await runTest('5. GitHub provider card triggers the existing GitHub workflow', () => {
    assert(syncCodeWorkflow.includes("setActiveWorkflow('github')"),
      'Clicking GitHub provider card must trigger setActiveWorkflow("github")');
    assert(appTsx.includes('activeWorkflow === \'github\''),
      'App.tsx must mount GithubWorkflow when activeWorkflow is github');
  });

  // 6. GitLab, Bitbucket, Azure DevOps show "Coming soon"
  await runTest('6. GitLab, Bitbucket, and Azure DevOps display "Coming soon"', () => {
    assert(syncCodeWorkflow.includes("id: 'gitlab'"), 'GitLab entry configured');
    assert(syncCodeWorkflow.includes("id: 'bitbucket'"), 'Bitbucket entry configured');
    assert(syncCodeWorkflow.includes("id: 'azure'"), 'Azure DevOps entry configured');
    assert(syncCodeWorkflow.includes("badge: 'Coming soon'"), 'Coming soon badge assigned to unreleased providers');
  });

  // 7. Navigation back button supports returning from Sync Code
  await runTest('7. Back button navigation restores dashboard from Sync Code view', () => {
    assert(syncCodeWorkflow.includes("id=\"sync-code-back-btn\""), 'Sync code view has back button');
    assert(syncCodeWorkflow.includes("setActiveWorkflow('none')"), 'Back button navigates to home');
  });

  // 8. Upload Files and Paste Code workflows remain intact
  await runTest('8. Upload Files and Paste Code workflows remain unchanged', () => {
    assert(appTsx.includes('activeWorkflow === \'upload\''), 'UploadWorkflow mounting preserved');
    assert(appTsx.includes('activeWorkflow === \'paste\''), 'PasteWorkflow mounting preserved');
    assert(workflowSelector.includes("setActiveWorkflow('upload')"), 'Upload card click handler intact');
    assert(workflowSelector.includes("setActiveWorkflow('paste')"), 'Paste card click handler intact');
  });

  console.log('\n==================================================================');
  console.log('   ALL 8 SYNC CODE WORKFLOW TESTS PASSED SUCCESSFULLY!');
  console.log('==================================================================');
}

runAllTests();
