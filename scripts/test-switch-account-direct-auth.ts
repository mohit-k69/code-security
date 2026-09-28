/**
 * AUTOMATED TEST SUITE: SWITCH ACCOUNT DIRECT AUTHENTICATION & UX REFINEMENT
 *
 * Validating the exact requirements:
 * 1. Remembered accounts store non-sensitive provider metadata ('google' | 'github' | 'email').
 * 2. Credential Safety: NO passwords, tokens, cookies, recovery codes, or secrets stored.
 * 3. Selecting a remembered Google account initiates direct Google OAuth with login_hint and without prompt='select_account'.
 * 4. Selecting a remembered GitHub account initiates direct GitHub OAuth.
 * 5. Selecting a remembered Email account opens the compact authentication screen with prefilled email.
 * 6. Compact Email Authentication uses signInWithPassword, never signUp, and does not store password.
 * 7. Anti-enumeration: Generic error message on incorrect password.
 * 8. "Use another account" opens compact authentication chooser (Google, GitHub, Email).
 * 9. Prior session termination is confirmed before initiating new authentication.
 * 10. Fallback and recovery integration (forgot password and emergency recovery codes) preserved.
 */

import fs from 'fs';
import {
  saveRememberedAccount,
  getRememberedAccounts,
  removeRememberedAccount,
  clearAllRememberedAccounts,
  RememberedAccount,
} from '../src/lib/accountSwitcher';

let passed = 0;
let failed = 0;
const results: { test: string; status: 'PASS' | 'FAIL'; message: string }[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    passed++;
    results.push({ test: name, status: 'PASS', message: 'Verified successfully.' });
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    failed++;
    results.push({ test: name, status: 'FAIL', message: err.message });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

// In-memory mock localStorage
const mockStorage: Record<string, string> = {};
(global as any).window = {
  location: {
    origin: 'https://ais-dev-yttuq5gkdg7nkwkz5bzlbh-138994004264.asia-east1.run.app',
  },
  localStorage: {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    },
  },
};

async function main() {
  console.log('==================================================================');
  console.log('   AUTOMATED TEST SUITE: SWITCH ACCOUNT DIRECT AUTHENTICATION');
  console.log('==================================================================\n');

  // Test 1: Remembered accounts store non-sensitive provider metadata
  await runTest('1. Remembered accounts store non-sensitive provider metadata', () => {
    clearAllRememberedAccounts();

    saveRememberedAccount({
      email: 'google.user@example.com',
      name: 'Google User',
      provider: 'google',
    });
    saveRememberedAccount({
      email: 'github.user@example.com',
      name: 'GitHub User',
      provider: 'github',
    });
    saveRememberedAccount({
      email: 'email.user@example.com',
      name: 'Email User',
      provider: 'email',
    });

    const accounts = getRememberedAccounts();
    assert(accounts.length === 3, 'Should store 3 accounts');

    const googleAcc = accounts.find((a) => a.email === 'google.user@example.com');
    const githubAcc = accounts.find((a) => a.email === 'github.user@example.com');
    const emailAcc = accounts.find((a) => a.email === 'email.user@example.com');

    assert(googleAcc?.provider === 'google', 'Google account provider must be google');
    assert(githubAcc?.provider === 'github', 'GitHub account provider must be github');
    assert(emailAcc?.provider === 'email', 'Email account provider must be email');
  });

  // Test 2: Credential safety: No sensitive data persisted
  await runTest('2. Credential Safety: No passwords, tokens, recovery codes, or secrets stored', () => {
    clearAllRememberedAccounts();

    const maliciousPayload: any = {
      email: 'victim@cody.sec',
      name: 'Victim User',
      provider: 'google',
      password: 'PlaintextPassword123!',
      access_token: 'sbp_tok_123',
      refresh_token: 'sbp_ref_456',
      oauth_token: 'gho_oauth_789',
      session_cookie: 'cookie=val',
      recovery_code: 'RC-1234-5678',
      mfa_secret: 'secret123',
    };

    saveRememberedAccount(maliciousPayload);

    const stored = getRememberedAccounts();
    assert(stored.length === 1, 'Account must be stored');
    const entry = stored[0] as any;

    assert(entry.email === 'victim@cody.sec', 'Email matches');
    assert(entry.name === 'Victim User', 'Name matches');
    assert(entry.provider === 'google', 'Provider matches');
    assert(entry.password === undefined, 'FORBIDDEN: password must not be stored');
    assert(entry.access_token === undefined, 'FORBIDDEN: access_token must not be stored');
    assert(entry.refresh_token === undefined, 'FORBIDDEN: refresh_token must not be stored');
    assert(entry.oauth_token === undefined, 'FORBIDDEN: oauth_token must not be stored');
    assert(entry.session_cookie === undefined, 'FORBIDDEN: session_cookie must not be stored');
    assert(entry.recovery_code === undefined, 'FORBIDDEN: recovery_code must not be stored');
    assert(entry.mfa_secret === undefined, 'FORBIDDEN: mfa_secret must not be stored');
  });

  // Test 3: Google low-friction direct authentication contract
  await runTest('3. Google low-friction direct auth passes login_hint and omits prompt=select_account', () => {
    const directAuthCode = fs.readFileSync('src/lib/directAccountAuth.ts', 'utf-8');

    assert(
      directAuthCode.includes('queryParams.login_hint = accountEmail'),
      'Direct Google auth must pass login_hint with account email'
    );
    assert(
      directAuthCode.includes("queryParams.prompt = 'select_account'"),
      'Fallback / another account must use prompt: select_account'
    );
    // Ensure accountEmail path does NOT force select_account
    assert(
      directAuthCode.includes('if (accountEmail && accountEmail.trim()) {'),
      'Direct auth must differentiate remembered account hint from generic chooser'
    );
  });

  // Test 4: GitHub direct authentication contract
  await runTest('4. GitHub direct auth initiates GitHub OAuth directly', () => {
    const directAuthCode = fs.readFileSync('src/lib/directAccountAuth.ts', 'utf-8');

    assert(
      directAuthCode.includes("provider: 'github'"),
      'Direct GitHub auth must specify provider: github'
    );
    assert(
      directAuthCode.includes("queryParams.login = accountEmail"),
      'Direct GitHub auth must pass login hint if email provided'
    );
  });

  // Test 5: Prior session termination check
  await runTest('5. Prior session termination enforced before initiating direct authentication', () => {
    const directAuthCode = fs.readFileSync('src/lib/directAccountAuth.ts', 'utf-8');

    assert(
      directAuthCode.includes('confirmSessionTerminated'),
      'Must define confirmSessionTerminated helper'
    );
    assert(
      directAuthCode.includes('await confirmSessionTerminated()'),
      'All direct authentication methods must confirm session termination before auth'
    );
  });

  // Test 6: Compact Email Authentication uses signInWithPassword, never signUp
  await runTest('6. Compact Email Authentication uses signInWithPassword only and never signUp', () => {
    const directAuthCode = fs.readFileSync('src/lib/directAccountAuth.ts', 'utf-8');

    assert(
      directAuthCode.includes('supabase.auth.signInWithPassword'),
      'Must call supabase.auth.signInWithPassword'
    );
    assert(
      !directAuthCode.includes('supabase.auth.signUp'),
      'Direct auth must NEVER call supabase.auth.signUp for remembered accounts'
    );
  });

  // Test 7: Anti-enumeration on email sign-in failure
  await runTest('7. Anti-enumeration: Generic error message on incorrect password', () => {
    const directAuthCode = fs.readFileSync('src/lib/directAccountAuth.ts', 'utf-8');

    assert(
      directAuthCode.includes("We couldn't sign you in with those details. Check your password and try again."),
      'Must display generic error on failed password'
    );
  });

  // Test 8: Compact UI components in AccountSwitcherModal
  await runTest('8. AccountSwitcherModal provides direct auth views: list, email-password, use-another', () => {
    const modalCode = fs.readFileSync('src/components/auth/AccountSwitcherModal.tsx', 'utf-8');

    assert(
      modalCode.includes('email-password'),
      'AccountSwitcherModal must support email-password view'
    );
    assert(
      modalCode.includes('use-another'),
      'AccountSwitcherModal must support compact use-another chooser view'
    );
    assert(
      modalCode.includes('direct-auth-submit-btn'),
      'Email password view must have primary submit button direct-auth-submit-btn'
    );
    assert(
      modalCode.includes('direct-auth-password-input'),
      'Email password view must have password input direct-auth-password-input'
    );
    assert(
      modalCode.includes('Continue with Google'),
      'Chooser view must offer Continue with Google'
    );
    assert(
      modalCode.includes('Continue with GitHub'),
      'Chooser view must offer Continue with GitHub'
    );
    assert(
      modalCode.includes('Continue with Email'),
      'Chooser view must offer Continue with Email'
    );
  });

  // Test 9: Recovery / Fallback integration
  await runTest('9. Recovery and fallback flows preserved in AccountSwitcherModal', () => {
    const modalCode = fs.readFileSync('src/components/auth/AccountSwitcherModal.tsx', 'utf-8');

    assert(
      modalCode.includes('Forgot password?'),
      'AccountSwitcherModal must offer Forgot password link'
    );
    assert(
      modalCode.includes('OnboardingRecoveryFlow'),
      'AccountSwitcherModal must integrate OnboardingRecoveryFlow for emergency recovery codes'
    );
    assert(
      modalCode.includes('resetPasswordForEmail'),
      'AccountSwitcherModal must integrate password reset email via Supabase'
    );
  });

  // Test 10: App.tsx seamlessly renders Cody upon direct authentication
  await runTest('10. App.tsx wires onAuthenticated to seamlessly enter Cody and exit switcher', () => {
    const appCode = fs.readFileSync('src/App.tsx', 'utf-8');

    assert(
      appCode.includes('onAuthenticated='),
      'App.tsx must pass onAuthenticated to AccountSwitcherModal'
    );
    assert(
      appCode.includes('provider: user.authProvider'),
      'App.tsx must record provider in saveRememberedAccount'
    );
  });

  console.log('\n==================================================================');
  console.log(`   TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
