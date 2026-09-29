/**
 * AUTOMATED TEST SUITE: BITBUCKET CLOUD INTEGRATION & REVIEW PIPELINE
 *
 * Verifies:
 * 1. Bitbucket OAuth uses minimum read permissions (repository, pullrequest), no write scopes.
 * 2. Secure provider token storage for Bitbucket in oauth_connections table.
 * 3. Repository listing and metadata mapping.
 * 4. Pull request listing and metadata mapping.
 * 5. BitbucketService adapts to ProviderService contract (PullRequest, PRFile).
 * 6. File content and diff retrieval for Bitbucket PRs.
 * 7. Frozen security-review pipeline (10 checkpoints, ContextManager, Sanitization) remains untouched and fully compatible.
 * 8. Bitbucket UI workflow components (ConnectCard, RepoList, PRList, Workflow).
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: BITBUCKET CLOUD INTEGRATION');
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
  const bitbucketServiceCode = fs.readFileSync(
    path.resolve('supabase/functions/analyze-repository/services/BitbucketService.ts'),
    'utf8'
  );
  const fetchReposCode = fs.readFileSync(
    path.resolve('supabase/functions/fetch-bitbucket-repos/index.ts'),
    'utf8'
  );
  const fetchPrsCode = fs.readFileSync(
    path.resolve('supabase/functions/fetch-bitbucket-prs/index.ts'),
    'utf8'
  );
  const storeTokenCode = fs.readFileSync(
    path.resolve('supabase/functions/store-provider-token/index.ts'),
    'utf8'
  );
  const analyzeIndexCode = fs.readFileSync(
    path.resolve('supabase/functions/analyze-repository/index.ts'),
    'utf8'
  );
  const bitbucketWorkflowCode = fs.readFileSync(
    path.resolve('src/components/workflows/BitbucketWorkflow.tsx'),
    'utf8'
  );
  const bitbucketPrListCode = fs.readFileSync(
    path.resolve('src/components/workflows/bitbucket/BitbucketPRList.tsx'),
    'utf8'
  );
  const syncCodeWorkflowCode = fs.readFileSync(
    path.resolve('src/components/workflows/SyncCodeWorkflow.tsx'),
    'utf8'
  );
  const appTsxCode = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  const checkpointsCode = fs.readFileSync(
    path.resolve('supabase/functions/analyze-repository/orchestrator/registry/CheckpointRegistry.ts'),
    'utf8'
  );

  // 1. Bitbucket OAuth read-only permissions
  await runTest('1. Bitbucket OAuth requests only read-only scopes (no write)', () => {
    assert(!bitbucketWorkflowCode.includes('repository:write'), 'No repository:write permission requested');
    assert(!bitbucketWorkflowCode.includes('pullrequest:write'), 'No pullrequest:write permission requested');
    assert(!bitbucketWorkflowCode.includes('account:write'), 'No account:write permission requested');
  });

  // 2. Token storage in oauth_connections
  await runTest('2. Bitbucket tokens are securely stored in oauth_connections table', () => {
    assert(storeTokenCode.includes("'bitbucket'"), 'store-provider-token validates bitbucket provider');
    assert(storeTokenCode.includes('https://api.bitbucket.org/2.0/user'), 'Validates token with Bitbucket user API');
    assert(storeTokenCode.includes("from('oauth_connections')"), 'Stores tokens in oauth_connections table');
  });

  // 3. Repository listing API
  await runTest('3. Bitbucket repository fetch endpoint and mapping', () => {
    assert(fetchReposCode.includes('/repositories?role=contributor'), 'Calls Bitbucket contributor repositories API');
    assert(fetchReposCode.includes('sort=-updated_on'), 'Sorts repositories by updated timestamp');
    assert(fetchReposCode.includes('pagelen=100'), 'Uses pagelen pagination');
    assert(fetchReposCode.includes('full_name'), 'Maps full_name workspace/repo path');
  });

  // 4. Pull request listing API
  await runTest('4. Bitbucket PR fetch endpoint and mapping', () => {
    assert(fetchPrsCode.includes('/pullrequests?state=OPEN'), 'Fetches open pull requests');
    assert(fetchPrsCode.includes('source_branch'), 'Extracts source branch');
    assert(fetchPrsCode.includes('target_branch'), 'Extracts target branch');
    assert(fetchPrsCode.includes('sha'), 'Extracts commit hash');
  });

  // 5. BitbucketService adapts to ProviderService contract
  await runTest('5. BitbucketService implements ProviderService contract', () => {
    assert(bitbucketServiceCode.includes('implements ProviderService'), 'Implements ProviderService interface');
    assert(bitbucketServiceCode.includes('getOpenPullRequests'), 'Implements getOpenPullRequests');
    assert(bitbucketServiceCode.includes('getPullRequestDetails'), 'Implements getPullRequestDetails');
    assert(bitbucketServiceCode.includes('getChangedFiles'), 'Implements getChangedFiles');
    assert(bitbucketServiceCode.includes('getDiff'), 'Implements getDiff');
    assert(bitbucketServiceCode.includes('getFileContent'), 'Implements getFileContent');
    assert(bitbucketServiceCode.includes('getRepositoryFiles'), 'Implements getRepositoryFiles');
  });

  // 6. Diffs & file contents
  await runTest('6. BitbucketService diffstat and raw diff handling', () => {
    assert(bitbucketServiceCode.includes('/diffstat'), 'Calls diffstat for accurate per-file change metrics');
    assert(bitbucketServiceCode.includes('/diff'), 'Calls diff endpoint for raw diff stream');
    assert(bitbucketServiceCode.includes('/src/${encodeURIComponent(ref)}'), 'Retrieves exact ref file content');
  });

  // 7. Security review pipeline preservation
  await runTest('7. Frozen review engine architecture is preserved', () => {
    assert(analyzeIndexCode.includes('new BitbucketService'), 'analyze-repository instantiates BitbucketService');
    assert(analyzeIndexCode.includes('new PipelineRunner()'), 'Reuses existing PipelineRunner');
    const specImports = [
      'AuthenticationSpec',
      'AuthorizationSpec',
      'InputValidationSpec',
      'SecretsManagementSpec',
      'SessionJwtSpec',
      'CryptographySpec',
      'SecurityConfigurationSpec',
      'XssSpec',
      'FilePathSecuritySpec',
      'DependencySupplyChainSpec'
    ];
    for (const spec of specImports) {
      assert(checkpointsCode.includes(spec), `CheckpointRegistry includes ${spec}`);
    }
    assert(checkpointsCode.includes('CHECKPOINT_REGISTRY'), 'CHECKPOINT_REGISTRY is defined');
  });

  // 8. UI workflow and review trigger
  await runTest('8. Bitbucket UI workflow and review trigger integration', () => {
    assert(syncCodeWorkflowCode.includes("id: 'bitbucket'"), 'Sync Code offers Bitbucket provider card');
    assert(appTsxCode.includes('BitbucketWorkflow'), 'App.tsx imports and renders BitbucketWorkflow');
    assert(bitbucketPrListCode.includes('start-bitbucket-review-btn'), 'Bitbucket PR list contains review button');
  });

  console.log('\nAll Bitbucket Cloud integration tests passed successfully!\n');
}

runAllTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
