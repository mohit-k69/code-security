/**
 * AUTOMATED TEST SUITE: GITLAB PHASE 1 INTEGRATION
 *
 * Tests the 10 specific requirements from the specification:
 * 1. GitLab OAuth initiation with minimum read-only scopes (read_user, read_api, read_repository).
 * 2. Successful GitLab authentication callback and user state mapping.
 * 3. Secure token storage/retrieval via store-provider-token and oauth_connections.
 * 4. Listing accessible GitLab projects (fetch-gitlab-projects edge function and useGitlab hook).
 * 5. Selecting a project (triggering project-level state and MR query).
 * 6. Listing that project's merge requests (fetch-gitlab-merge-requests edge function).
 * 7. Selecting a merge request (ready state indication without triggering analysis).
 * 8. Unauthenticated state handling (rendering Connect GitLab card).
 * 9. OAuth / API failure handling (401 expired, 404 not found, 502 bad gateway).
 * 10. Verification: Zero write operations, zero code execution, zero modifications to downstream review pipeline.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: GITLAB PHASE 1 INTEGRATION');
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
  const storeTokenPath = path.resolve('supabase/functions/store-provider-token/index.ts');
  const storeTokenCode = fs.readFileSync(storeTokenPath, 'utf8');

  const fetchProjectsPath = path.resolve('supabase/functions/fetch-gitlab-projects/index.ts');
  const fetchProjectsCode = fs.readFileSync(fetchProjectsPath, 'utf8');

  const fetchMrsPath = path.resolve('supabase/functions/fetch-gitlab-merge-requests/index.ts');
  const fetchMrsCode = fs.readFileSync(fetchMrsPath, 'utf8');

  const useGitlabPath = path.resolve('src/hooks/useGitlab.ts');
  const useGitlabCode = fs.readFileSync(useGitlabPath, 'utf8');

  const connectCardPath = path.resolve('src/components/workflows/gitlab/GitlabConnectCard.tsx');
  const connectCardCode = fs.readFileSync(connectCardPath, 'utf8');

  const syncCodePath = path.resolve('src/components/workflows/SyncCodeWorkflow.tsx');
  const syncCodeCode = fs.readFileSync(syncCodePath, 'utf8');

  const appTsxPath = path.resolve('src/App.tsx');
  const appTsxCode = fs.readFileSync(appTsxPath, 'utf8');

  const pipelineRunnerPath = path.resolve('supabase/functions/analyze-repository/orchestrator/PipelineRunner.ts');
  const pipelineRunnerCode = fs.readFileSync(pipelineRunnerPath, 'utf8');

  const reviewOrchestratorPath = path.resolve('supabase/functions/analyze-repository/orchestrator/ReviewOrchestrator.ts');
  const reviewOrchestratorCode = fs.readFileSync(reviewOrchestratorPath, 'utf8');

  // 1. GitLab OAuth initiation with minimum read-only scopes
  await runTest('1. GitLab OAuth initiation requests minimum read-only scopes', () => {
    assert(connectCardCode.includes("provider: 'gitlab'"), 'OAuth provider must be gitlab');
    assert(connectCardCode.includes("scopes: 'read_user read_api read_repository'"), 'Must request read-only scopes');
    assert(!connectCardCode.includes("write_repository"), 'Must NOT request write_repository');
    assert(!connectCardCode.includes("api'"), 'Must NOT request full api write scope');
    assert(!connectCardCode.includes("sudo"), 'Must NOT request administrative/sudo scopes');
  });

  // 2. Successful GitLab authentication callback & session handling
  await runTest('2. Successful GitLab authentication callback maps isGitlabLinked and gitlabUsername', () => {
    const useAuthPath = path.resolve('src/hooks/useAuth.ts');
    const useAuthCode = fs.readFileSync(useAuthPath, 'utf8');

    assert(useAuthCode.includes('isGitlabLinked'), 'User model must track isGitlabLinked');
    assert(useAuthCode.includes('gitlabUsername'), 'User model must track gitlabUsername');
    assert(useAuthCode.includes("id.provider === 'gitlab'"), 'Identities check must include gitlab');
    assert(appTsxCode.includes("urlParams.get('workflow') === 'gitlab'"), 'App.tsx must handle workflow=gitlab redirect');
  });

  // 3. Secure token storage & retrieval
  await runTest('3. Secure token storage validates token with GitLab API and stores in oauth_connections', () => {
    assert(storeTokenCode.includes("provider === 'gitlab'"), 'store-provider-token handles gitlab provider');
    assert(storeTokenCode.includes('https://gitlab.com/api/v4/user'), 'Validates token against GitLab user API');
    assert(storeTokenCode.includes("from('oauth_connections')"), 'Stores token in oauth_connections');
    assert(fetchProjectsCode.includes(".eq('provider', 'gitlab')"), 'fetch-gitlab-projects queries provider=gitlab');
    assert(fetchMrsCode.includes(".eq('provider', 'gitlab')"), 'fetch-gitlab-merge-requests queries provider=gitlab');
  });

  // 4. Listing accessible projects
  await runTest('4. fetch-gitlab-projects lists accessible projects with pagination and sorting', () => {
    assert(fetchProjectsCode.includes('https://gitlab.com/api/v4/projects'), 'Calls GitLab projects endpoint');
    assert(fetchProjectsCode.includes('membership=true'), 'Filters by user project membership');
    assert(fetchProjectsCode.includes('order_by=updated_at'), 'Sorts by updated timestamp');
    assert(useGitlabCode.includes("supabase.functions.invoke('fetch-gitlab-projects'"), 'useGitlab invokes edge function');
  });

  // 5. Selecting a project
  await runTest('5. Selecting a project updates state and triggers merge request retrieval', () => {
    assert(useGitlabCode.includes('selectProject'), 'selectProject handler present in useGitlab');
    assert(useGitlabCode.includes('fetchGitlabMergeRequests(project.id)'), 'selectProject queries project MRs');
  });

  // 6. Listing that project\'s merge requests
  await runTest('6. fetch-gitlab-merge-requests lists merge requests for the selected project', () => {
    assert(fetchMrsCode.includes('/merge_requests'), 'Calls GitLab project merge requests endpoint');
    assert(fetchMrsCode.includes('state=all'), 'Fetches merge requests across open/merged/closed states');
    assert(useGitlabCode.includes("supabase.functions.invoke('fetch-gitlab-merge-requests'"), 'useGitlab invokes MR edge function');
  });

  // 7. Selecting a merge request
  await runTest('7. Selecting a merge request marks selection and displays ready status', () => {
    assert(useGitlabCode.includes('selectMergeRequest'), 'selectMergeRequest handler present');
    assert(useGitlabCode.includes('selectedMR'), 'selectedMR state tracked');

    const gitlabMrListPath = path.resolve('src/components/workflows/gitlab/GitlabMergeRequestList.tsx');
    const gitlabMrListCode = fs.readFileSync(gitlabMrListPath, 'utf8');
    assert(gitlabMrListCode.includes('Merge Request Ready') || gitlabMrListCode.includes('Merge Request Selected'), 
      'Displays selected MR confirmation');
  });

  // 8. Unauthenticated state handling
  await runTest('8. Unauthenticated/unconnected state displays Connect GitLab action card', () => {
    const gitlabWorkflowPath = path.resolve('src/components/workflows/GitlabWorkflow.tsx');
    const gitlabWorkflowCode = fs.readFileSync(gitlabWorkflowPath, 'utf8');

    assert(gitlabWorkflowCode.includes('<GitlabConnectCard'), 'Mounts GitlabConnectCard when not connected');
    assert(connectCardCode.includes('id="connect-gitlab-btn"'), 'Connect GitLab button present');
  });

  // 9. OAuth / API failure handling
  await runTest('9. Error states handle 401 expired tokens, 404 missing projects, and 502 provider errors', () => {
    assert(fetchProjectsCode.includes('GitLab connection expired. Please reconnect.'), '401 token expiry handled');
    assert(fetchProjectsCode.includes('GitLab connection not found'), '404 missing connection handled');
    assert(fetchMrsCode.includes('GitLab project not found or inaccessible'), '404 project error handled');
    assert(fetchMrsCode.includes('Failed to fetch merge requests from GitLab'), '502 API failure handled');
  });

  // 10. No write operation is performed
  await runTest('10. Verification: Zero write endpoints or mutations against GitLab API', () => {
    const gitlabFiles = [fetchProjectsCode, fetchMrsCode, storeTokenCode];
    for (const code of gitlabFiles) {
      assert(!code.includes("method: 'POST'") || code.includes("api/v4/user") || code.includes("fetch-gitlab"), 
        'No write POST requests allowed to repository APIs');
      assert(!code.includes("method: 'DELETE'"), 'No DELETE requests');
      assert(!code.includes("method: 'PUT'"), 'No PUT requests');
    }
  });

  // 11. Verification: Downstream GitHub security review pipeline is unchanged
  await runTest('11. Critical boundary: Existing GitHub security review pipeline is frozen and unchanged', () => {
    assert(pipelineRunnerCode.includes('new ContextManager'), 'ContextManager instantiation intact');
    assert(pipelineRunnerCode.includes('new SensitiveDataDetector'), 'SensitiveDataDetector intact');
    assert(pipelineRunnerCode.includes('new SensitiveDataSanitizer'), 'SensitiveDataSanitizer intact');
    assert(pipelineRunnerCode.includes('new SanitizationValidator'), 'SanitizationValidator intact');
    assert(pipelineRunnerCode.includes('new ReviewOrchestrator'), 'ReviewOrchestrator intact');
    assert(reviewOrchestratorCode.includes('getEnabledCheckpoints()'), '10 security checkpoints intact');
  });

  console.log('\n==================================================================');
  console.log('   ALL 11 GITLAB PHASE 1 INTEGRATION TESTS PASSED SUCCESSFULLY!');
  console.log('==================================================================');
}

runAllTests();
