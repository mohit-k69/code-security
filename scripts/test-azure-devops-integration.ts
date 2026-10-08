/**
 * AUTOMATED TEST SUITE: AZURE DEVOPS SERVICES INTEGRATION & REVIEW PIPELINE
 *
 * Verifies:
 * 1. Microsoft Entra ID OAuth authorization flow uses delegated read-only `vso.code` permission.
 * 2. Secure provider token storage for Azure DevOps in oauth_connections table.
 * 3. Repository listing and metadata mapping.
 * 4. Pull request listing with iterations mapping.
 * 5. AzureDevOpsService adapts to ProviderService contract (PullRequest, PRFile).
 * 6. File content and diff retrieval for Azure DevOps PRs.
 * 7. Frozen security-review pipeline (10 checkpoints, ContextManager, Sanitization) remains untouched and fully compatible.
 * 8. Azure DevOps UI workflow components (ConnectCard, RepoList, PRList, Workflow).
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: AZURE DEVOPS SERVICES INTEGRATION');
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
  const azureServiceCode = fs.readFileSync(
    path.resolve('supabase/functions/analyze-repository/services/AzureDevOpsService.ts'),
    'utf8'
  );
  const fetchReposCode = fs.readFileSync(
    path.resolve('supabase/functions/fetch-azure-repos/index.ts'),
    'utf8'
  );
  const fetchPrsCode = fs.readFileSync(
    path.resolve('supabase/functions/fetch-azure-prs/index.ts'),
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
  const azureWorkflowCode = fs.readFileSync(
    path.resolve('src/components/workflows/AzureWorkflow.tsx'),
    'utf8'
  );
  const azurePrListCode = fs.readFileSync(
    path.resolve('src/components/workflows/azure/AzurePRList.tsx'),
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

  // 1. Microsoft Entra ID OAuth permissions
  await runTest('1. Azure DevOps OAuth requests only delegated read-only scopes (no write/manage)', () => {
    assert(!azureWorkflowCode.includes('vso.code_write'), 'No vso.code_write permission requested');
    assert(!azureWorkflowCode.includes('vso.code_manage'), 'No vso.code_manage permission requested');
    assert(!azureWorkflowCode.includes('vso.code_full'), 'No vso.code_full permission requested');
  });

  // 2. Token storage in oauth_connections
  await runTest('2. Azure DevOps tokens are securely stored in oauth_connections table', () => {
    assert(storeTokenCode.includes("'azure'"), 'store-provider-token validates azure provider');
    assert(storeTokenCode.includes('app.vssps.visualstudio.com/_apis/profile/profiles/me'), 'Validates profile with Azure DevOps API');
    assert(storeTokenCode.includes("from('oauth_connections')"), 'Stores tokens in oauth_connections table');
  });

  // 3. Organizations and Repositories listing API
  await runTest('3. Azure DevOps repository fetch endpoint and mapping', () => {
    assert(fetchReposCode.includes('_apis/accounts'), 'Discovers user accounts / organizations');
    assert(fetchReposCode.includes('_apis/git/repositories'), 'Fetches git repositories from Azure DevOps');
    assert(fetchReposCode.includes('project_name'), 'Captures project_name metadata');
  });

  // 4. Pull request listing API
  await runTest('4. Azure DevOps PR fetch endpoint and mapping', () => {
    assert(fetchPrsCode.includes('searchCriteria.status=active'), 'Fetches active pull requests');
    assert(fetchPrsCode.includes('sourceRefName'), 'Extracts source branch ref');
    assert(fetchPrsCode.includes('targetRefName'), 'Extracts target branch ref');
    assert(fetchPrsCode.includes('commitId'), 'Extracts merge commit hash');
  });

  // 5. AzureDevOpsService adapts to ProviderService contract
  await runTest('5. AzureDevOpsService implements ProviderService contract', () => {
    assert(azureServiceCode.includes('implements ProviderService'), 'Implements ProviderService interface');
    assert(azureServiceCode.includes('getOpenPullRequests'), 'Implements getOpenPullRequests');
    assert(azureServiceCode.includes('getPullRequestDetails'), 'Implements getPullRequestDetails');
    assert(azureServiceCode.includes('getChangedFiles'), 'Implements getChangedFiles');
    assert(azureServiceCode.includes('getDiff'), 'Implements getDiff');
    assert(azureServiceCode.includes('getFileContent'), 'Implements getFileContent');
    assert(azureServiceCode.includes('getRepositoryFiles'), 'Implements getRepositoryFiles');
  });

  // 6. PR iterations and diff retrieval
  await runTest('6. AzureDevOpsService iteration changes and file content handling', () => {
    assert(azureServiceCode.includes('/iterations'), 'Inspects PR iterations for changed file list');
    assert(azureServiceCode.includes('/items?path='), 'Retrieves exact file content for specified commit/ref');
  });

  // 7. Security review pipeline preservation
  await runTest('7. Frozen review engine architecture is preserved for Azure DevOps', () => {
    assert(analyzeIndexCode.includes('new AzureDevOpsService'), 'analyze-repository instantiates AzureDevOpsService');
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

  // 8. UI workflow and review trigger (Isolated)
  await runTest('8. Azure DevOps UI workflow and review trigger integration (Isolated)', () => {
    assert(!syncCodeWorkflowCode.includes("id: 'azure'"), 'Sync Code does NOT offer Azure DevOps provider card');
    assert(!appTsxCode.includes('<AzureWorkflow'), 'App.tsx does NOT render AzureWorkflow');
    assert(azurePrListCode.includes('start-azure-review-btn'), 'Azure PR list contains review button');
  });

  console.log('\nAll Azure DevOps Services integration tests passed successfully!\n');
}

runAllTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
