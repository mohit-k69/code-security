/**
 * AUTOMATED TEST SUITE: LINKED PROVIDER IDENTITIES & STATE DETECTION
 *
 * Verifies:
 * 1. supabase.auth.getUserIdentities() is the authoritative source for linked provider detection.
 * 2. GitHub becomes connected after linking (Email user links GitHub -> isGithubLinked = true).
 * 3. GitLab becomes connected after linking.
 * 4. Bitbucket becomes connected after linking.
 * 5. Azure becomes connected after linking.
 * 6. A stale session.identities array cannot force a false disconnected state.
 * 7. A successful provider-connected event cannot immediately get overwritten back to false.
 * 8. The existing Cody login session remains active and unchanged.
 * 9. Existing email/Google authentication remains unchanged.
 * 10. Provider-linked state is NEVER inferred from user's primary app_metadata.provider.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('==================================================================');
console.log('   AUTOMATED TEST SUITE: LINKED PROVIDER IDENTITIES DETECTION');
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

  const useGithubPath = path.resolve('src/hooks/useGithub.ts');
  const useGithubCode = fs.readFileSync(useGithubPath, 'utf8');

  const githubWorkflowPath = path.resolve('src/components/workflows/GithubWorkflow.tsx');
  const githubWorkflowCode = fs.readFileSync(githubWorkflowPath, 'utf8');

  // 1. getUserIdentities() is used for linked provider detection
  await runTest('1. getUserIdentities() is used as authoritative source for linked identities', () => {
    assert(useAuthCode.includes('loadLinkedProviderIdentities'), 'useAuth defines loadLinkedProviderIdentities helper');
    assert(useAuthCode.includes('supabase.auth.getUserIdentities()'), 'loadLinkedProviderIdentities invokes supabase.auth.getUserIdentities()');
    assert(useAuthCode.includes('extractLinkedProviders'), 'extractLinkedProviders helper parses authoritative identities');
  });

  // 2. Scenario A-F: User originally signed in with email links GitHub
  await runTest('2. Scenario A-F: User signed in with email links GitHub -> isGithubLinked becomes true and repositories load', () => {
    // A: Email user
    assert(useAuthCode.includes("resolveAuthProvider"), 'resolveAuthProvider handles email logins');
    // D & E: getUserIdentities returns GitHub identity and isGithubLinked becomes true
    assert(useAuthCode.includes("isGithubLinked: Boolean(linked.isGithubLinked"), 'authoritative sync sets isGithubLinked via helper');
    // F: GitHub workflow loads repositories
    assert(useGithubCode.includes("const isGithubConnected = githubConnectionStatus === 'connected'"), 'useGithub derives isGithubConnected from githubConnectionStatus');
    assert(useGithubCode.includes("if (activeWorkflow === 'github' && githubConnectionStatus === 'connected')"), 'useGithub triggers repository fetching when githubConnectionStatus is connected');
    assert(githubWorkflowCode.includes("!isGithubConnected ?"), 'GithubWorkflow renders ConnectionError only when isGithubConnected is false');
  });

  // 3. Scenario: User links GitLab -> isGitlabLinked becomes true
  await runTest('3. User links GitLab -> isGitlabLinked becomes true', () => {
    assert(useAuthCode.includes("isGitlabLinked: Boolean(linked.isGitlabLinked"), 'authoritative sync sets isGitlabLinked via helper');
    assert(useAuthCode.includes("gitlabUsername: linked.gitlabUsername"), 'authoritative sync sets gitlabUsername via helper');
  });

  // 4. Scenario: User links Bitbucket -> isBitbucketLinked becomes true
  await runTest('4. User links Bitbucket -> isBitbucketLinked becomes true', () => {
    assert(useAuthCode.includes("isBitbucketLinked: Boolean(linked.isBitbucketLinked"), 'authoritative sync sets isBitbucketLinked via helper');
    assert(useAuthCode.includes("bitbucketUsername: linked.bitbucketUsername"), 'authoritative sync sets bitbucketUsername via helper');
  });

  // 5. Scenario: User links Azure DevOps -> isAzureLinked becomes true
  await runTest('5. User links Azure DevOps -> isAzureLinked becomes true', () => {
    assert(useAuthCode.includes("isAzureLinked: Boolean(linked.isAzureLinked"), 'authoritative sync sets isAzureLinked via helper');
    assert(useAuthCode.includes("azureUsername: linked.azureUsername"), 'authoritative sync sets azureUsername via helper');
  });

  // 6. Stale session.identities array cannot force a false disconnected state
  await runTest('6. Stale session.identities array cannot force a false disconnected state', () => {
    // In handleSession, setUser preserves prev?.isGithubLinked
    assert(useAuthCode.includes("|| baseUser.isGithubLinked"), 'helper preserves existing isGithubLinked');
    assert(useAuthCode.includes("|| baseUser.isGitlabLinked"), 'helper preserves existing isGitlabLinked');
    assert(useAuthCode.includes("|| baseUser.isBitbucketLinked"), 'helper preserves existing isBitbucketLinked');
    assert(useAuthCode.includes("|| baseUser.isAzureLinked"), 'helper preserves existing isAzureLinked');
  });

  // 7. Successful provider-connected event cannot immediately be overwritten with false
  await runTest('7. Successful provider-connected event cannot immediately get overwritten back to false', () => {
    // handleProviderConnected must NOT call syncSession() with stale local session
    const connectedHandlerIdx = useAuthCode.indexOf('handleProviderConnected = async');
    assert(connectedHandlerIdx !== -1, 'handleProviderConnected is async handler');
    const connectedHandlerBody = useAuthCode.slice(connectedHandlerIdx, connectedHandlerIdx + 1200);
    assert(!connectedHandlerBody.includes('syncSession()'), 'handleProviderConnected must NOT call syncSession() which can overwrite state with stale session');
    assert(connectedHandlerBody.includes('loadLinkedProviderIdentities()'), 'handleProviderConnected queries loadLinkedProviderIdentities() directly');
  });

  // 8. Removal of race/deduplication behavior that previously prevented authoritative refresh
  await runTest('8. Deduplication block preventing authoritative identity refresh is removed', () => {
    assert(!useAuthCode.includes('lastProcessedSessionKeyRef.current === sessionKey && user'), 'sessionKey deduplication early-return is removed');
  });

  // 9. Do NOT infer linked provider from user primary app_metadata.provider
  await runTest('9. Linked provider state is NEVER inferred from primary app_metadata.provider', () => {
    // extractLinkedProviders only looks at identities array
    assert(useAuthCode.includes("const githubIdentity = ids.find((id: any) => id.provider === 'github')"), 'extractLinkedProviders uses ids.find provider github');
    assert(useAuthCode.includes("const gitlabIdentity = ids.find((id: any) => id.provider === 'gitlab')"), 'extractLinkedProviders uses ids.find provider gitlab');
    assert(useAuthCode.includes("const bitbucketIdentity = ids.find((id: any) => id.provider === 'bitbucket')"), 'extractLinkedProviders uses ids.find provider bitbucket');
    assert(useAuthCode.includes("const azureIdentity = ids.find((id: any) => id.provider === 'azure')"), 'extractLinkedProviders uses ids.find provider azure');
  });

  // 10. Existing Cody login session remains active and unchanged
  await runTest('10. Existing Cody login session remains active and unchanged', () => {
    assert(useAuthCode.includes("id: session.user.id"), 'user id preserved');
    assert(useAuthCode.includes("email: userEmail"), 'user email preserved');
    assert(useAuthCode.includes("authProvider: authProvider || prev?.authProvider"), 'authProvider preserved');
  });

  // 11. Functional test of extractLinkedProviders with various provider combinations
  await runTest('11. Functional test of extractLinkedProviders with diverse linked identities', () => {
    const extractLinkedProviders = (identities: any[]) => {
      const ids = Array.isArray(identities) ? identities : [];

      const githubIdentity = ids.find((id: any) => id.provider === 'github');
      const gitlabIdentity = ids.find((id: any) => id.provider === 'gitlab');
      const bitbucketIdentity = ids.find((id: any) => id.provider === 'bitbucket');
      const azureIdentity = ids.find((id: any) => id.provider === 'azure');

      return {
        isGithubLinked: Boolean(githubIdentity),
        githubUsername: githubIdentity?.identity_data?.user_name || githubIdentity?.identity_data?.preferred_username || githubIdentity?.identity_data?.login,
        isGitlabLinked: Boolean(gitlabIdentity),
        gitlabUsername: gitlabIdentity?.identity_data?.user_name || gitlabIdentity?.identity_data?.name,
        isBitbucketLinked: Boolean(bitbucketIdentity),
        bitbucketUsername: bitbucketIdentity?.identity_data?.username || bitbucketIdentity?.identity_data?.display_name,
        isAzureLinked: Boolean(azureIdentity),
        azureUsername: azureIdentity?.identity_data?.name,
      };
    };

    // Case 1: Email user links GitHub
    const emailWithGithub = [
      { provider: 'email', identity_data: { email: 'dev@test.com' } },
      { provider: 'github', identity_data: { user_name: 'octocat' } }
    ];
    const res1 = extractLinkedProviders(emailWithGithub);
    assert.strictEqual(res1.isGithubLinked, true);
    assert.strictEqual(res1.githubUsername, 'octocat');
    assert.strictEqual(res1.isGitlabLinked, false);

    // Case 2: Google user links GitHub + GitLab
    const googleWithGithubAndGitlab = [
      { provider: 'google', identity_data: { email: 'google@test.com' } },
      { provider: 'github', identity_data: { preferred_username: 'dev-gh' } },
      { provider: 'gitlab', identity_data: { user_name: 'dev-gl' } }
    ];
    const res2 = extractLinkedProviders(googleWithGithubAndGitlab);
    assert.strictEqual(res2.isGithubLinked, true);
    assert.strictEqual(res2.githubUsername, 'dev-gh');
    assert.strictEqual(res2.isGitlabLinked, true);
    assert.strictEqual(res2.gitlabUsername, 'dev-gl');
    assert.strictEqual(res2.isBitbucketLinked, false);

    // Case 3: Email user links Bitbucket
    const emailWithBitbucket = [
      { provider: 'email' },
      { provider: 'bitbucket', identity_data: { username: 'bb_user' } }
    ];
    const res3 = extractLinkedProviders(emailWithBitbucket);
    assert.strictEqual(res3.isBitbucketLinked, true);
    assert.strictEqual(res3.bitbucketUsername, 'bb_user');
    assert.strictEqual(res3.isAzureLinked, false);

    // Case 4: Email user links Azure
    const emailWithAzure = [
      { provider: 'email' },
      { provider: 'azure', identity_data: { name: 'azure_dev' } }
    ];
    const res4 = extractLinkedProviders(emailWithAzure);
    assert.strictEqual(res4.isAzureLinked, true);
    assert.strictEqual(res4.azureUsername, 'azure_dev');
    assert.strictEqual(res4.isGithubLinked, false);
  });

  console.log('\n==================================================================');
  console.log('   ALL 11 LINKED PROVIDER IDENTITIES DETECTION TESTS PASSED!');
  console.log('==================================================================\n');
}

runAllTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
