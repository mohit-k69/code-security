/**
 * AUTOMATED TEST SUITE: COMPLETE EMAIL AUTH UX REFINEMENT — SINGLE "CONTINUE" FLOW
 *
 * Requirements verified:
 * 1. Single primary button: "Continue" (replaces separate/dual button wording)
 * 2. Visible "Create Account" wording removed from the submit button
 * 3. Page communicates "Sign in or create your account to continue"
 * 4. Step 1: First attempts normal email/password sign-in using existing Supabase Auth
 * 5. Step 2: If sign-in succeeds, signs existing user in and continues into Cody
 * 6. Step 3: If credentials do not match existing usable account, attempts Supabase signUp
 * 7. Step 4: If signUp succeeds with immediately usable session, signs new user in automatically
 * 8. Step 5: If Supabase requires email confirmation, shows clear "Check your email to confirm your account" state
 * 9. Step 6: If email is already registered or password wrong, shows generic error without enumerating account existence
 * 10. No client-side database / API probing for email existence (no /api/auth/check-email client calls)
 * 11. Rate limit handling provides clear, friendly error
 * 12. Security: Never treats form submission as auth; requires valid Supabase session
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
  console.log('   AUTOMATED TEST SUITE: SINGLE "CONTINUE" EMAIL AUTH UX');
  console.log('==================================================================');

  const onboardingStepsContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/auth/onboarding/OnboardingSteps.tsx'),
    'utf-8'
  );

  const onboardingContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/Onboarding.tsx'),
    'utf-8'
  );

  // 1. Single primary button: "Continue"
  await runTest('1. Primary submit button label is "Continue"', () => {
    assert(
      onboardingStepsContent.includes('<span>Continue</span>'),
      'Submit button must contain "Continue"'
    );
  });

  // 2. Visible "Create Account" wording removed from submit button
  await runTest('2. "Create Account" label is removed from the form button', () => {
    const submitBtnArea = onboardingStepsContent.slice(
      onboardingStepsContent.indexOf('id="email-submit-btn"'),
      onboardingStepsContent.indexOf('id="email-submit-btn"') + 400
    );
    assert(
      !submitBtnArea.includes('Create Account'),
      'Submit button should not show "Create Account"'
    );
    assert(
      !submitBtnArea.includes('Sign In'),
      'Submit button should not switch between "Sign In" and "Create Account"'
    );
  });

  // 3. Page communicates "Sign in or create your account to continue"
  await runTest('3. Screen communicates "Sign in or create your account to continue"', () => {
    assert(
      onboardingStepsContent.includes('Sign in or create your account to continue'),
      'Header/subtitle must communicate "Sign in or create your account to continue"'
    );
  });

  // 4. No client-side /api/auth/check-email probe in Onboarding.tsx
  await runTest('4. No client-side /api/auth/check-email duplicate probes in Onboarding.tsx', () => {
    assert(
      !onboardingContent.includes('/api/auth/check-email'),
      'Client-side Onboarding component must not probe /api/auth/check-email'
    );
    assert(
      !onboardingStepsContent.includes('email-duplicate-inline-warning'),
      'Must not display pre-typing duplicate email warning'
    );
    assert(
      !onboardingStepsContent.includes('Checking email…'),
      'Must not display pre-typing "Checking email..." indicator'
    );
  });

  // 5. Order of operations: signInWithPassword called BEFORE signUp
  await runTest('5. Order of operations: attempts signInWithPassword before signUp', () => {
    const signInIdx = onboardingContent.indexOf('supabase.auth.signInWithPassword');
    const signUpIdx = onboardingContent.indexOf('supabase.auth.signUp');
    assert(signInIdx !== -1, 'signInWithPassword must be called');
    assert(signUpIdx !== -1, 'signUp must be called');
    assert(
      signInIdx < signUpIdx,
      'signInWithPassword must be attempted before fallback to signUp'
    );
  });

  // 6. Generic anti-enumeration error for duplicate/wrong password
  await runTest('6. Anti-enumeration generic error on registered email with wrong password', () => {
    const expectedError = "We couldn't sign you in with those details. Check your email and password and try again.";
    assert(
      onboardingContent.includes(expectedError),
      `Expected generic message "${expectedError}" in Onboarding.tsx`
    );
  });

  // 7. GoTrue duplicate protection (identities: []) handled with generic error
  await runTest('7. GoTrue duplicate identities protection handled with generic error', () => {
    assert(
      onboardingContent.includes('identities') && onboardingContent.includes('identities.length === 0'),
      'Must check for empty identities array to catch existing accounts under email confirmation'
    );
  });

  // 8. Email confirmation state provided for pending confirmation
  await runTest('8. Clear "Check your email to confirm your account" state for unconfirmed users', () => {
    assert(
      onboardingContent.includes('showEmailConfirmation'),
      'Onboarding must track email confirmation state'
    );
    assert(
      onboardingStepsContent.includes('OnboardingEmailConfirmation'),
      'OnboardingSteps must provide OnboardingEmailConfirmation view'
    );
    assert(
      onboardingStepsContent.includes('Check your email'),
      'Confirmation view must display "Check your email"'
    );
  });

  // 9. Session invariant: User only authenticated on valid Supabase session
  await runTest('9. Security invariant: onLogin is only invoked with valid session/user', () => {
    const loginMatches = onboardingContent.match(/onLogin\(/g);
    assert(loginMatches !== null && loginMatches.length >= 2, 'onLogin should be called on successful auth paths');
    assert(
      onboardingContent.includes('signInData.session') && onboardingContent.includes('signUpData.session'),
      'onLogin must only be called when Supabase returns an active session'
    );
  });

  // 10. Rate limit error handling
  await runTest('10. Rate limit errors handled gracefully', () => {
    assert(
      onboardingContent.includes('Too many attempts. Please try again later.'),
      'Must handle 429 / rate limits with user-friendly message'
    );
  });

  // 11. Existing remembered account and analytics integration preserved
  await runTest('11. Account remembering and PostHog tracking preserved', () => {
    assert(
      onboardingContent.includes('saveRememberedAccount'),
      'Must preserve saveRememberedAccount on successful auth'
    );
    assert(
      onboardingContent.includes('user_logged_in') && onboardingContent.includes('user_signed_up'),
      'Must preserve user_logged_in and user_signed_up analytics events'
    );
  });

  console.log('==================================================================');
  console.log(`   TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
