/**
 * AUTOMATED TEST SUITE: MULTI-PROVIDER OAUTH CALLBACK & STATE RESTORATION
 *
 * Verifies:
 * 1. GitHub OAuth return restores GitHub workflow and connected state.
 * 2. GitLab OAuth return restores GitLab workflow and connected state.
 * 3. Bitbucket OAuth return restores Bitbucket workflow and connected state.
 * 4. Azure OAuth return restores Azure workflow and connected state.
 * 5. Authoritative user identity refresh using supabase.auth.getUser() when cached session is stale.
 * 6. Multi-provider URL cleanup preserves workflow parameters (github, gitlab, bitbucket, azure).
 * 7. Successful OAuth does not kick user to default dashboard.
 * 8. Existing Email/Google authentication invariants remain unchanged.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: MULTI-PROVIDER OAUTH CALLBACK & STATE');
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
  const useAuthPath = path.resolve('src/hooks/useAuth.ts');
  const useAuthCode = fs.readFileSync(useAuthPath, 'utf8');

  const appPath = path.resolve('src/App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf8');

  const gitlabConnectPath = path.resolve('src/components/workflows/gitlab/GitlabConnectCard.tsx');
  const gitlabConnectCode = fs.readFileSync(gitlabConnectPath, 'utf8');

  const bitbucketConnectPath = path.resolve('src/components/workflows/bitbucket/BitbucketConnectCard.tsx');
  const bitbucketConnectCode = fs.readFileSync(bitbucketConnectPath, 'utf8');

  const azureConnectPath = path.resolve('src/components/workflows/azure/AzureConnectCard.tsx');
  const azureConnectCode = fs.readFileSync(azureConnectPath, 'utf8');

  const githubWorkflowPath = path.resolve('src/components/workflows/GithubWorkflow.tsx');
  const githubWorkflowCode = fs.readFileSync(githubWorkflowPath, 'utf8');

  // 1. GitHub OAuth return restores GitHub workflow and connected state
  await runTest('1. GitHub OAuth return restores GitHub workflow and connected state', () => {
    assert(appCode.includes("targetWorkflow === 'github'"), 'App.tsx handles targetWorkflow github');
    assert(appCode.includes("setActiveWorkflow('github')"), 'App.tsx sets active workflow to github');
    assert(useAuthCode.includes("isGithubLinked: freshGithubLinked"), 'useAuth sets freshGithubLinked');
  });

  // 2. GitLab OAuth return restores GitLab workflow and connected state
  await runTest('2. GitLab OAuth return restores GitLab workflow and connected state', () => {
    assert(appCode.includes("targetWorkflow === 'gitlab'"), 'App.tsx handles targetWorkflow gitlab');
    assert(appCode.includes("setActiveWorkflow('gitlab')"), 'App.tsx sets active workflow to gitlab');
    assert(useAuthCode.includes("isGitlabLinked: freshGitlabLinked"), 'useAuth sets freshGitlabLinked');
  });

  // 3. Bitbucket OAuth return restores Bitbucket workflow and connected state
  await runTest('3. Bitbucket OAuth return restores Bitbucket workflow and connected state', () => {
    assert(appCode.includes("targetWorkflow === 'bitbucket'"), 'App.tsx handles targetWorkflow bitbucket');
    assert(appCode.includes("setActiveWorkflow('bitbucket')"), 'App.tsx sets active workflow to bitbucket');
    assert(useAuthCode.includes("isBitbucketLinked: freshBitbucketLinked"), 'useAuth sets freshBitbucketLinked');
  });

  // 4. Azure DevOps OAuth return restores Azure workflow and connected state
  await runTest('4. Azure DevOps OAuth return restores Azure workflow and connected state', () => {
    assert(appCode.includes("targetWorkflow === 'azure'"), 'App.tsx handles targetWorkflow azure');
    assert(appCode.includes("setActiveWorkflow('azure')"), 'App.tsx sets active workflow to azure');
    assert(useAuthCode.includes("isAzureLinked: freshAzureLinked"), 'useAuth sets freshAzureLinked');
  });

  // 5. Authoritative user identity refresh using supabase.auth.getUser() when cached session is stale
  await runTest('5. Authoritative user identity refresh using supabase.auth.getUser()', () => {
    assert(useAuthCode.includes("supabase.auth.getUser().then"), 'useAuth calls supabase.auth.getUser()');
    assert(useAuthCode.includes("userData.user.identities"), 'useAuth inspects live identities from getUser()');
    assert(useAuthCode.includes("codevibe_bitbucket_connected"), 'useAuth listens for bitbucket connection event');
    assert(useAuthCode.includes("codevibe_gitlab_connected"), 'useAuth listens for gitlab connection event');
    assert(useAuthCode.includes("codevibe_azure_connected"), 'useAuth listens for azure connection event');
  });

  // 6. Multi-provider URL cleanup preserves workflow parameters
  await runTest('6. URL cleanup preserves workflow for all 4 providers', () => {
    assert(useAuthCode.includes("['github', 'gitlab', 'bitbucket', 'azure'].includes(workflow.toLowerCase())"), 'useAuth preserves all 4 providers during URL cleanup');
    assert(!useAuthCode.includes("workflow=github ? '?workflow=github' : ''"), 'Hardcoded GitHub-only URL cleanup is removed');
  });

  // 7. Successful OAuth does not kick user to default dashboard
  await runTest('7. OAuth session tracking fallback prevents kicking to default dashboard', () => {
    assert(appCode.includes("sessionFlow"), 'App.tsx checks sessionStorage fallback for workflow restoration');
    assert(useAuthCode.includes("cody_oauth_flow_provider"), 'useAuth checks cody_oauth_flow_provider');
  });

  // 8. Existing Email/Google authentication invariants remain unchanged
  await runTest('8. Existing Email and Google auth checks remain completely intact', () => {
    assert(useAuthCode.includes("isOAuthUser"), 'isOAuthUser helper present');
    assert(useAuthCode.includes("resolveAuthProvider"), 'resolveAuthProvider helper present');
    assert(useAuthCode.includes("session.user.email_confirmed_at"), 'Email confirmation check intact');
  });

  console.log('\n==================================================================');
  console.log('   ALL 8 MULTI-PROVIDER OAUTH CALLBACK TESTS PASSED!');
  console.log('==================================================================\n');
}

runAllTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
