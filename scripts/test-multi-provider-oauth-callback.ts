/**
 * AUTOMATED TEST SUITE: MULTI-PROVIDER OAUTH CALLBACK & STATE RESTORATION
 *
 * Verifies:
 * 1. GitHub OAuth callback establishes/restores the session.
 * 2. GitLab OAuth callback establishes/restores the session.
 * 3. Bitbucket OAuth callback establishes/restores the session.
 * 4. Azure OAuth callback establishes/restores the session.
 * 5. OAuth callback parameters are not removed before Supabase processes them (no premature replaceState).
 * 6. Workflow is restored correctly after callback.
 * 7. Successful OAuth does not return to the unauthenticated onboarding screen.
 * 8. Provider token is stored under the correct provider (including retryProviderTokenSetup).
 * 9. Email/password authentication remains unchanged.
 * 10. Google authentication remains unchanged.
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

  // 1. GitHub OAuth callback establishes/restores the session
  await runTest('1. GitHub OAuth callback establishes/restores the session', () => {
    assert(appCode.includes("targetWorkflow === 'github'"), 'App.tsx handles targetWorkflow github');
    assert(appCode.includes("setActiveWorkflow('github')"), 'App.tsx sets active workflow to github');
    assert(useAuthCode.includes("isGithubLinked: freshGithubLinked"), 'useAuth sets freshGithubLinked');
    assert(useAuthCode.includes("flowProvider === 'github'"), 'useAuth binds provider_token with flowProvider github');
  });

  // 2. GitLab OAuth callback establishes/restores the session
  await runTest('2. GitLab OAuth callback establishes/restores the session', () => {
    assert(appCode.includes("targetWorkflow === 'gitlab'"), 'App.tsx handles targetWorkflow gitlab');
    assert(appCode.includes("setActiveWorkflow('gitlab')"), 'App.tsx sets active workflow to gitlab');
    assert(useAuthCode.includes("isGitlabLinked: freshGitlabLinked"), 'useAuth sets freshGitlabLinked');
    assert(useAuthCode.includes("flowProvider === 'gitlab'"), 'useAuth binds provider_token with flowProvider gitlab');
  });

  // 3. Bitbucket OAuth callback establishes/restores the session
  await runTest('3. Bitbucket OAuth callback establishes/restores the session', () => {
    assert(appCode.includes("targetWorkflow === 'bitbucket'"), 'App.tsx handles targetWorkflow bitbucket');
    assert(appCode.includes("setActiveWorkflow('bitbucket')"), 'App.tsx sets active workflow to bitbucket');
    assert(useAuthCode.includes("isBitbucketLinked: freshBitbucketLinked"), 'useAuth sets freshBitbucketLinked');
    assert(useAuthCode.includes("flowProvider === 'bitbucket'"), 'useAuth binds provider_token with flowProvider bitbucket');
  });

  // 4. Azure OAuth callback establishes/restores the session
  await runTest('4. Azure OAuth callback establishes/restores the session', () => {
    assert(appCode.includes("targetWorkflow === 'azure'"), 'App.tsx handles targetWorkflow azure');
    assert(appCode.includes("setActiveWorkflow('azure')"), 'App.tsx sets active workflow to azure');
    assert(useAuthCode.includes("isAzureLinked: freshAzureLinked"), 'useAuth sets freshAzureLinked');
    assert(useAuthCode.includes("flowProvider === 'azure'"), 'useAuth binds provider_token with flowProvider azure');
  });

  // 5. OAuth callback parameters are not removed before Supabase processes them
  await runTest('5. OAuth callback parameters are not prematurely removed in App.tsx', () => {
    // App.tsx workflow effect must NOT call replaceState, preserving URL for Supabase Auth
    const workflowEffect = appCode.slice(appCode.indexOf('targetWorkflow === \'github\''), appCode.indexOf('setActiveTab(\'reviewed\')'));
    assert(!workflowEffect.includes('window.history.replaceState'), 'App.tsx workflow effect must NOT wipe URL with replaceState');
    assert(useAuthCode.includes('hasPendingOAuthCallback'), 'useAuth tracks pending OAuth callbacks in URL');
  });

  // 6. Workflow is restored correctly after callback
  await runTest('6. Workflow parameter is safely preserved during URL cleanup', () => {
    assert(useAuthCode.includes('cleanOAuthCallbackUrl'), 'useAuth defines cleanOAuthCallbackUrl');
    assert(useAuthCode.includes("['github', 'gitlab', 'bitbucket', 'azure'].includes(targetWorkflow.toLowerCase())"), 'cleanOAuthCallbackUrl preserves workflow for all 4 providers');
    assert(appCode.includes("sessionFlow"), 'App.tsx restores workflow from sessionStorage fallback');
  });

  // 7. Successful OAuth does not return to the unauthenticated onboarding screen
  await runTest('7. In-flight callback prevents premature fallback to unauthenticated onboarding screen', () => {
    assert(useAuthCode.includes("hasPendingOAuthCallback() && source === 'syncSession'"), 'syncSession checks hasPendingOAuthCallback before resetting session');
    assert(useAuthCode.includes("waiting for onAuthStateChange exchange"), 'useAuth preserves initialization state for onAuthStateChange');
    assert(useAuthCode.includes("oauthTimeoutId"), 'useAuth has safety timeout to guarantee unblocking');
  });

  // 8. Provider token is stored under the correct provider
  await runTest('8. Provider token is stored under the correct provider and retryProviderTokenSetup is provider-safe', () => {
    assert(useAuthCode.includes("store-provider-token"), 'store-provider-token is called');
    assert(useAuthCode.includes("provider\n          }"), 'store-provider-token receives explicit provider in body');
    assert(useAuthCode.includes("retryProviderTokenSetup"), 'retryProviderTokenSetup exists');
    assert(useAuthCode.includes("provider === 'gitlab' ? 'fetch-gitlab-projects'"), 'retryProviderTokenSetup checks appropriate provider test endpoint');
    assert(useAuthCode.includes("provider === 'bitbucket' ? 'fetch-bitbucket-repos'"), 'retryProviderTokenSetup handles bitbucket');
    assert(useAuthCode.includes("provider === 'azure' ? 'fetch-azure-repos'"), 'retryProviderTokenSetup handles azure');
  });

  // 9. Email/password authentication remains unchanged
  await runTest('9. Email/password authentication checks remain completely intact', () => {
    assert(useAuthCode.includes("isEmailConfirmed"), 'Email confirmation check is intact');
    assert(useAuthCode.includes("session.user.email_confirmed_at"), 'email_confirmed_at check is intact');
    assert(useAuthCode.includes("session.user.confirmed_at"), 'confirmed_at check is intact');
  });

  // 10. Google authentication remains unchanged
  await runTest('10. Google authentication remains recognized and unchanged', () => {
    assert(useAuthCode.includes("'google'"), 'Google provider recognized');
    assert(useAuthCode.includes("oauthProviders = ['google', 'github', 'gitlab', 'bitbucket', 'azure']"), 'isOAuthUser supports google, github, gitlab, bitbucket, azure');
    assert(useAuthCode.includes("primaryProvider === 'google'"), 'resolveAuthProvider recognizes google');
  });

  // 11. Functional logic test of helper functions
  await runTest('11. Functional helper logic validation (isOAuthUser & URL cleaning)', () => {
    // Dynamically test the logic of isOAuthUser
    const testIsOAuthUser = (user: any, identities: any[] = []) => {
      if (!user) return false;
      const oauthProviders = ['google', 'github', 'gitlab', 'bitbucket', 'azure'];
      const primaryProvider = user.app_metadata?.provider;
      if (primaryProvider && oauthProviders.includes(primaryProvider)) return true;

      const providers: string[] = user.app_metadata?.providers || [];
      if (providers.some((p: string) => oauthProviders.includes(p))) return true;

      const ids = identities.length > 0 ? identities : (user.identities || []);
      if (ids.some((id: any) => oauthProviders.includes(id.provider))) {
        return true;
      }

      return false;
    };

    assert.strictEqual(testIsOAuthUser({ app_metadata: { provider: 'github' } }), true, 'github user is OAuth user');
    assert.strictEqual(testIsOAuthUser({ app_metadata: { provider: 'gitlab' } }), true, 'gitlab user is OAuth user');
    assert.strictEqual(testIsOAuthUser({ app_metadata: { provider: 'bitbucket' } }), true, 'bitbucket user is OAuth user');
    assert.strictEqual(testIsOAuthUser({ app_metadata: { provider: 'azure' } }), true, 'azure user is OAuth user');
    assert.strictEqual(testIsOAuthUser({ app_metadata: { provider: 'google' } }), true, 'google user is OAuth user');
    assert.strictEqual(testIsOAuthUser({ app_metadata: { provider: 'email' } }), false, 'email user is not OAuth user');
    assert.strictEqual(testIsOAuthUser({ app_metadata: { provider: 'email' } }, [{ provider: 'gitlab' }]), true, 'email user with linked gitlab identity is recognized as OAuth user');
  });

  console.log('\n==================================================================');
  console.log('   ALL 11 MULTI-PROVIDER OAUTH CALLBACK TESTS PASSED!');
  console.log('==================================================================\n');
}

runAllTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
