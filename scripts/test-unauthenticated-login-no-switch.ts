/**
 * AUTOMATED REGRESSION TEST: Unauthenticated Login Screen & Authenticated Account Switcher Isolation
 *
 * Requirements:
 * 1. Default unauthenticated login screen does NOT render "Switch to another account"
 * 2. Default login screen renders "Welcome to Cody" directly with sign in options
 * 3. Authenticated account menu still exposes "Switch account"
 * 4. Authenticated account-switching modal/flow is preserved and isolated
 */

import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function pass(name: string) {
  console.log(`  [PASS] ${name}`);
}

async function runTests() {
  console.log('==================================================================');
  console.log('   AUTOMATED TEST SUITE: UNAUTHENTICATED LOGIN VS SWITCH ACCOUNT   ');
  console.log('==================================================================\n');

  // Test 1: Onboarding.tsx does NOT render "Switch to another account"
  {
    const onboardingCode = fs.readFileSync(path.resolve('src/Onboarding.tsx'), 'utf-8');
    assert(!onboardingCode.includes('Switch to another account'), 'Onboarding.tsx must not contain "Switch to another account"');
    assert(!onboardingCode.includes('onboarding-switch-account-btn'), 'Onboarding.tsx must not render onboarding-switch-account-btn');
    assert(!onboardingCode.includes('onOpenAccountSwitcher'), 'Onboarding.tsx must not accept onOpenAccountSwitcher prop');
    pass('1. Unauthenticated/default login page does not render "Switch to another account"');
  }

  // Test 2: Onboarding.tsx displays standard branding and login step cleanly
  {
    const onboardingCode = fs.readFileSync(path.resolve('src/Onboarding.tsx'), 'utf-8');
    assert(onboardingCode.includes('CodeVibeIcon'), 'Onboarding.tsx must render Cody logo');
    assert(onboardingCode.includes('OnboardingEmailStep'), 'Onboarding.tsx must render OnboardingEmailStep');
    pass('2. Default login screen renders clean Cody logo and auth step without extraneous switch buttons');
  }

  // Test 3: Authenticated account menu in Header.tsx still exposes "Switch account"
  {
    const headerCode = fs.readFileSync(path.resolve('src/components/layout/Header.tsx'), 'utf-8');
    assert(headerCode.includes('onSwitchAccount'), 'Header.tsx must accept onSwitchAccount prop');
    assert(headerCode.includes('id="switch-account-btn"'), 'Header.tsx must render switch-account-btn');
    assert(headerCode.includes('<span>Switch account</span>'), 'Header.tsx dropdown must render "Switch account" label');
    pass('3. Authenticated account menu still exposes existing "Switch account" functionality');
  }

  // Test 4: App.tsx wires handleSwitchAccount to Header and renders AccountSwitcherModal when switching
  {
    const appCode = fs.readFileSync(path.resolve('src/App.tsx'), 'utf-8');
    assert(appCode.includes('const handleSwitchAccount = async () =>'), 'App.tsx must define handleSwitchAccount');
    assert(appCode.includes('onSwitchAccount={handleSwitchAccount}'), 'App.tsx must pass handleSwitchAccount to Header');
    assert(appCode.includes('<AccountSwitcherModal'), 'App.tsx must render AccountSwitcherModal when isSwitchingAccount is true');
    assert(appCode.includes('<Onboarding'), 'App.tsx must render Onboarding when unauthenticated');
    pass('4. App.tsx cleanly separates unauthenticated Onboarding from authenticated AccountSwitcherModal');
  }

  // Test 5: AccountSwitcherModal.tsx contains full in-app switcher views and direct auth
  {
    const switcherCode = fs.readFileSync(path.resolve('src/components/auth/AccountSwitcherModal.tsx'), 'utf-8');
    assert(switcherCode.includes('getRememberedAccounts'), 'AccountSwitcherModal accesses remembered accounts');
    assert(switcherCode.includes('initiateGoogleDirectAuth'), 'AccountSwitcherModal supports direct Google auth');
    assert(switcherCode.includes('initiateGithubDirectAuth'), 'AccountSwitcherModal supports direct GitHub auth');
    assert(switcherCode.includes('authenticateEmailDirect'), 'AccountSwitcherModal supports direct email auth');
    pass('5. Dedicated in-app account switcher retains all remembered-account and direct auth workflows');
  }

  console.log('\n==================================================================');
  console.log('   ALL 5 UNAUTHENTICATED LOGIN & SWITCH ACCOUNT TESTS PASSED!     ');
  console.log('==================================================================\n');
}

runTests().catch((err) => {
  console.error('\n[TEST SUITE FAILURE]', err);
  process.exit(1);
});
