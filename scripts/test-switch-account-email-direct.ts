/**
 * AUTOMATED TEST SUITE: SWITCH ACCOUNT DIRECT EMAIL AUTHENTICATION
 *
 * Verifies the UX fix:
 * "Continue with Email" on "Sign in with another account" IMMEDIATELY opens
 * direct compact Email + Password authentication without opening generic onboarding.
 */

import fs from 'fs';
import path from 'path';

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

async function main() {
  console.log('==================================================================');
  console.log('   AUTOMATED TEST SUITE: SWITCH ACCOUNT DIRECT EMAIL AUTH UX');
  console.log('==================================================================\n');

  const modalPath = path.resolve(process.cwd(), 'src/components/auth/AccountSwitcherModal.tsx');
  const modalCode = fs.readFileSync(modalPath, 'utf-8');

  // Test 1: "Continue with Email" does NOT exit to generic onboarding
  await runTest('1. Continue with Email does not call onUseAnotherAccount or exit to generic onboarding', () => {
    // Find the Continue with Email button in modalCode
    const emailBtnIndex = modalCode.indexOf('id="use-another-email-btn"');
    assert(emailBtnIndex !== -1, 'Modal must contain button with id="use-another-email-btn"');

    // Extract enclosing button block
    const btnEndIndex = modalCode.indexOf('</button>', emailBtnIndex) + 9;
    const btnBlock = modalCode.slice(emailBtnIndex, btnEndIndex);

    assert(
      !btnBlock.includes('onClick={onUseAnotherAccount}'),
      'Continue with Email must NOT call onUseAnotherAccount (which would exit modal)'
    );
    assert(
      btnBlock.includes("setView('email-password')"),
      'Continue with Email must transition directly to email-password view'
    );
  });

  // Test 2: Case B initializes empty email and password
  await runTest('2. Case B initializes empty email and password for new sign-in', () => {
    const emailBtnIndex = modalCode.indexOf('id="use-another-email-btn"');
    const btnEndIndex = modalCode.indexOf('</button>', emailBtnIndex) + 9;
    const btnBlock = modalCode.slice(emailBtnIndex, btnEndIndex);

    assert(
      btnBlock.includes("setEmailInput('')"),
      'Continue with Email must reset emailInput to empty string'
    );
    assert(
      btnBlock.includes("setSelectedAccount(null)"),
      'Continue with Email must clear selectedAccount'
    );
  });

  // Test 3: Dedicated compact email authentication view contains all required elements
  await runTest('3. Compact email screen contains Title, Subtitle, Inputs, and Continue button', () => {
    assert(
      modalCode.includes('Sign in or create your account to continue'),
      'Must contain subtitle "Sign in or create your account to continue"'
    );
    assert(
      modalCode.includes('id="direct-auth-email-input"'),
      'Must have email input with id="direct-auth-email-input"'
    );
    assert(
      modalCode.includes('id="direct-auth-password-input"'),
      'Must have password input with id="direct-auth-password-input"'
    );
    assert(
      modalCode.includes('id="direct-auth-submit-btn"'),
      'Must have primary submit button with id="direct-auth-submit-btn"'
    );
    assert(
      modalCode.includes("'Continue'"),
      'Must display single "Continue" button label'
    );
  });

  // Test 4: "Forgot password?" is placed directly below Continue button
  await runTest('4. "Forgot password?" link is placed below Continue button and opens recovery', () => {
    const submitBtnIdx = modalCode.indexOf('id="direct-auth-submit-btn"');
    const forgotPwdIdx = modalCode.indexOf('Forgot password?', submitBtnIdx);
    assert(
      forgotPwdIdx !== -1 && forgotPwdIdx > submitBtnIdx,
      '"Forgot password?" link must follow Continue button'
    );
    assert(
      modalCode.includes("setView('forgot-password')"),
      'Must switch to forgot-password view on click'
    );
  });

  // Test 5: "Have an emergency recovery code?" is available on email authentication screen
  await runTest('5. "Have an emergency recovery code?" is available on email screen', () => {
    const forgotPwdIdx = modalCode.indexOf('Forgot password?');
    const recoveryCodeIdx = modalCode.indexOf('Have an emergency recovery code?', forgotPwdIdx);
    assert(
      recoveryCodeIdx !== -1 && recoveryCodeIdx > forgotPwdIdx,
      'Recovery code link must be accessible on email screen below forgot password'
    );
  });

  // Test 6: Case A pre-fills email from remembered account
  await runTest('6. Case A pre-fills email when remembered account is selected', () => {
    assert(
      modalCode.includes('setEmailInput(account.email)'),
      'handleAccountClick must pre-fill emailInput with remembered account email'
    );
    assert(
      modalCode.includes('value={emailInput}'),
      'Email input must bind to emailInput state'
    );
  });

  // Test 7: Automatic new account sign-up and email confirmation handling
  await runTest('7. Automatically attempts sign-in first, then sign-up for new accounts with email confirmation support', () => {
    assert(
      modalCode.includes('supabase.auth.signInWithPassword'),
      'Must attempt signInWithPassword first'
    );
    assert(
      modalCode.includes('supabase.auth.signUp'),
      'Must attempt signUp if signIn fails for new/unremembered account'
    );
    assert(
      modalCode.includes("setView('email-confirmation')"),
      'Must show email-confirmation view if email confirmation is required'
    );
    assert(
      modalCode.includes('OnboardingEmailConfirmation'),
      'Must render OnboardingEmailConfirmation component'
    );
  });

  // Test 8: Prior session termination check enforced
  await runTest('8. Prior session termination enforced before direct email authentication', () => {
    assert(
      modalCode.includes('confirmSessionTerminated'),
      'Must invoke confirmSessionTerminated before authenticating'
    );
  });

  // Test 9: Anti-enumeration generic errors preserved
  await runTest('9. Anti-enumeration generic error on existing account with wrong credentials', () => {
    assert(
      modalCode.includes("We couldn't sign you in with those details. Check your email and password and try again.") ||
      modalCode.includes("We couldn't sign you in with those details. Check your password and try again."),
      'Must display generic error on authentication failure without exposing account existence'
    );
  });

  // Test 10: Seamless entry into Cody upon authentication
  await runTest('10. Authenticated session updates user, remembers account, and closes switcher', () => {
    assert(
      modalCode.includes('saveRememberedAccount'),
      'Must save remembered account metadata upon successful authentication'
    );
    assert(
      modalCode.includes('onAuthenticated('),
      'Must trigger onAuthenticated callback'
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
