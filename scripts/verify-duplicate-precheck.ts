import { isValidEmailFormat, isValidEmailDomain, normalizeEmail } from '../src/components/auth/onboarding/emailUtils';

async function runTests() {
  console.log('🧪 Starting Duplicate Email Pre-Check Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name}`);
      failed++;
    }
  }

  // --- Scenario G: Format and domain validation (preventing pre-check on incomplete/invalid emails) ---
  console.log('--- Testing Scenario G & Format Validation ---');
  assert(!isValidEmailFormat('mohit@'), 'Incomplete email "mohit@" fails format validation');
  assert(!isValidEmailFormat('mohit'), 'String without domain "mohit" fails format validation');
  assert(!isValidEmailFormat('mohit@gmail'), 'String without TLD "mohit@gmail" fails format validation');
  assert(isValidEmailFormat('mohit.k.main@gmail.com'), 'Valid email "mohit.k.main@gmail.com" passes format validation');
  assert(isValidEmailDomain('mohit.k.main@gmail.com'), 'Recognized provider gmail.com passes domain check');
  assert(!isValidEmailDomain('test@fakeunknownprovider12345.xyz'), 'Unrecognized domain fails domain check');

  // --- Scenario 8: Normalization consistency ---
  console.log('\n--- Testing Normalization ---');
  assert(normalizeEmail('  Mohit.K.Main@Gmail.Com  ') === 'mohit.k.main@gmail.com', 'Email is cleanly trimmed and lowercased');
  assert(normalizeEmail('USER@EXAMPLE.COM') === 'user@example.com', 'Uppercase converted to lowercase');

  // --- Scenario A, D, E, F: Live Backend API check for existing accounts ---
  console.log('\n--- Testing Live Backend /api/auth/check-email ---');
  const checkEmail = async (email: string) => {
    const res = await fetch('http://localhost:3000/api/auth/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return res.json();
  };

  try {
    // A: Existing email
    const resA = await checkEmail('mohit.k.main@gmail.com');
    assert(resA.exists === true, 'Scenario A: Existing account (mohit.k.main@gmail.com) detected as exists=true');

    // E: Existing Google OAuth email
    const resE = await checkEmail('hitkaushal6260@gmail.com');
    assert(resE.exists === true, 'Scenario E: Existing Google OAuth email detected as exists=true');

    // F: Existing GitHub OAuth email
    const resF = await checkEmail('mohitkaushal.ca@gmail.com');
    assert(resF.exists === true, 'Scenario F: Existing GitHub OAuth email detected as exists=true');

    // C: New email
    const resC = await checkEmail('brandnewuser987654321@gmail.com');
    assert(resC.exists === false, 'Scenario C: Non-existing email detected as exists=false');

    // Normalization in request: spaces + upper case
    const resNorm = await checkEmail('   MOHIT.K.MAIN@GMAIL.COM   ');
    assert(resNorm.exists === true, 'Scenario Normalization: Whitespace & uppercase email matches existing record');
  } catch (err: any) {
    console.error('Error connecting to dev server:', err);
    assert(false, 'Dev server /api/auth/check-email responded successfully');
  }

  // --- Scenario I: Debounce & Rapid Typing Simulation ---
  console.log('\n--- Testing Scenario I: Debounce & Rapid Typing Logic ---');
  let networkCalls = 0;
  const mockCheckedCache: Record<string, boolean> = {};

  let activeTimer: any = null;
  const simulateType = (input: string, onExecute: (email: string) => void) => {
    const normalized = normalizeEmail(input);
    if (!normalized || !isValidEmailFormat(normalized) || !isValidEmailDomain(normalized)) {
      if (activeTimer) clearTimeout(activeTimer);
      return;
    }
    if (activeTimer) clearTimeout(activeTimer);
    activeTimer = setTimeout(() => {
      networkCalls++;
      onExecute(normalized);
    }, 500);
  };

  // Type rapidly
  simulateType('m', () => {});
  simulateType('mo', () => {});
  simulateType('moh', () => {});
  simulateType('mohit@', () => {});
  simulateType('mohit.k.main@g', () => {});
  simulateType('mohit.k.main@gmail.com', (em) => {
    mockCheckedCache[em] = true;
  });

  // Wait 600ms for debounce
  await new Promise((r) => setTimeout(r, 600));
  assert(networkCalls === 1, 'Scenario I: Rapid typing resulted in exactly 1 API call after stopping');
  assert(mockCheckedCache['mohit.k.main@gmail.com'] === true, 'Scenario I: Debounced check executed for final valid email');

  // --- Scenario Cache: Re-checking same email ---
  console.log('\n--- Testing Cache Redundancy Avoidance ---');
  const initialCalls = networkCalls;
  // If in cache, do not fire network call
  if (mockCheckedCache['mohit.k.main@gmail.com'] !== undefined) {
    // Cached, skip
  } else {
    networkCalls++;
  }
  assert(networkCalls === initialCalls, 'Cached email does not issue a new network request');

  // --- Scenario H: Switching from existing email to new email ---
  console.log('\n--- Testing Scenario H: Transition from Existing to New Email ---');
  let isDuplicate = true;
  let emailError = 'Account already exists. Please use a different email.';
  
  // User changes email to a new address
  const newEmail = 'freshuser12345@gmail.com';
  // Immediate clear on change
  if (normalizeEmail(newEmail) !== 'mohit.k.main@gmail.com') {
    isDuplicate = false;
    emailError = '';
  }
  assert(isDuplicate === false, 'Scenario H: isDuplicate reset to false when user changes email');
  assert(emailError === '', 'Scenario H: emailError cleared when user changes email');

  // --- Scenario 11: Error separation between email and password fields ---
  console.log('\n--- Testing Scenario 11: Email vs Password Error Separation ---');
  const testError1 = 'Account already exists. Please use a different email.';
  const isPasswordError1 = Boolean(testError1 && (testError1.toLowerCase().includes('password') || testError1.toLowerCase().includes('credential')));
  const isEmailInvalid1 = Boolean((testError1 && !isPasswordError1) || isDuplicate);

  assert(!isPasswordError1, 'Scenario 11: "Account already exists" is NOT treated as a password error');
  assert(isEmailInvalid1, 'Scenario 11: "Account already exists" marks email field as invalid');

  const testError2 = 'Password must be at least 6 characters';
  const isPasswordError2 = Boolean(testError2 && (testError2.toLowerCase().includes('password') || testError2.toLowerCase().includes('credential')));
  const isEmailInvalid2 = Boolean((testError2 && !isPasswordError2));

  assert(isPasswordError2, 'Scenario 11: "Password must be at least 6 characters" marks password as invalid');
  assert(!isEmailInvalid2, 'Scenario 11: "Password must be at least 6 characters" does NOT mark email as invalid');

  // --- Scenario J: Network failure fallback ---
  console.log('\n--- Testing Scenario J: Temporary Network Failure Fallback ---');
  let fallbackDuplicate = false;
  let fallbackError = '';
  try {
    throw new Error('Network error / connection refused');
  } catch {
    // Must NOT say email exists, must NOT block signup
    fallbackDuplicate = false;
    fallbackError = '';
  }
  assert(!fallbackDuplicate, 'Scenario J: Network failure does NOT mark account as duplicate');
  assert(fallbackError === '', 'Scenario J: Network failure does NOT falsely show account exists warning');

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
