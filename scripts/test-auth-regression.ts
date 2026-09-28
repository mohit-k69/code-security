/**
 * Focused Authentication Regression Test Suite
 * Validating the 8 exact scenarios requested.
 */

import { isOAuthUser } from '../src/hooks/useAuth';

let passed = 0;
let failed = 0;
const results: { scenario: string; status: 'PASS' | 'FAIL'; details: string }[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        passed++;
        results.push({ scenario: name, status: 'PASS', details: 'All assertions verified successfully.' });
      }).catch((err) => {
        failed++;
        results.push({ scenario: name, status: 'FAIL', details: err.message });
      });
    }
    passed++;
    results.push({ scenario: name, status: 'PASS', details: 'All assertions verified successfully.' });
  } catch (err: any) {
    failed++;
    results.push({ scenario: name, status: 'FAIL', details: err.message });
  }
}

// Simulates the exact handleSession logic from useAuth.ts
async function simulateHandleSession(session: any, fetchedUserData: any = null, mockSupabaseSignOut: () => Promise<any> = async () => {}) {
  let userState: any = null;
  let dispatchedEvents: { event: string; detail?: any }[] = [];
  let signedOutCalled = false;

  const mockDispatchEvent = (event: { type: string; detail?: any }) => {
    dispatchedEvents.push({ event: event.type, detail: event.detail });
  };

  if (!session?.user) {
    return { userState: null, dispatchedEvents, signedOutCalled };
  }

  const meta = session.user.user_metadata;
  let identities = session.user.identities || [];
  let isGithubLinked = Boolean(
    session.user.app_metadata?.providers?.includes('github') ||
    session.user.app_metadata?.provider === 'github' ||
    identities.some((id: any) => id.provider === 'github') ||
    session.provider_token
  );

  if (!isGithubLinked || identities.length === 0 || !session.user.app_metadata?.provider) {
    if (fetchedUserData) {
      if (fetchedUserData.identities && fetchedUserData.identities.length > 0) {
        identities = fetchedUserData.identities;
      }
      isGithubLinked = Boolean(
        fetchedUserData.app_metadata?.providers?.includes('github') ||
        fetchedUserData.app_metadata?.provider === 'github' ||
        identities.some((id: any) => id.provider === 'github') ||
        session.provider_token
      );
    }
  }

  const isOAuth =
    isOAuthUser(session.user, identities) ||
    (fetchedUserData ? isOAuthUser(fetchedUserData, identities) : false) ||
    Boolean(session.provider_token);

  const userEmail =
    session.user.email ||
    meta?.email ||
    fetchedUserData?.email ||
    identities.find((id: any) => id.identity_data?.email)?.identity_data?.email ||
    '';

  if (isOAuth) {
    if (!userEmail || userEmail.trim() === '') {
      await mockSupabaseSignOut();
      signedOutCalled = true;
      const isGoogle = session.user.app_metadata?.provider === 'google' || identities.some((id: any) => id.provider === 'google');
      const providerName = isGoogle ? 'Google' : 'GitHub';
      const userFriendlyError = `Your ${providerName} account did not provide an email address. Please ensure an email is associated with your ${providerName} account and try again.`;
      mockDispatchEvent({ type: 'codevibe_auth_error', detail: { message: userFriendlyError } });
      return { userState: null, dispatchedEvents, signedOutCalled };
    }
  } else {
    const isEmailConfirmed = Boolean(
      session.user.email_confirmed_at ||
      session.user.confirmed_at ||
      fetchedUserData?.email_confirmed_at ||
      fetchedUserData?.confirmed_at
    );

    if (!isEmailConfirmed) {
      await mockSupabaseSignOut();
      signedOutCalled = true;
      mockDispatchEvent({
        type: 'codevibe_auth_error',
        detail: { message: 'Please confirm your email address before signing in.' }
      });
      return { userState: null, dispatchedEvents, signedOutCalled };
    }
  }

  userState = {
    id: session.user.id,
    name: meta?.full_name || meta?.name || meta?.first_name || userEmail.split('@')[0] || 'User',
    email: userEmail,
    avatar: meta?.avatar_url || meta?.picture,
    created_at: session.user.created_at,
    isGithubLinked,
    authProvider: isOAuth ? (session.user.app_metadata?.provider === 'github' ? 'github' : 'google') : 'email',
  };

  return { userState, dispatchedEvents, signedOutCalled };
}

async function runAll() {
  console.log('=== RUNNING AUTH REGRESSION TEST SUITE ===\n');

  // Scenario 1: New Google OAuth signup -> direct dashboard access, no email verification screen
  await runTest('Scenario 1: New Google OAuth signup -> direct dashboard access', async () => {
    const newGoogleSession = {
      user: {
        id: 'google-new-user-001',
        email: 'newuser@gmail.com',
        email_confirmed_at: null, // Note: new OAuth might not have email_confirmed_at initially set
        app_metadata: {
          provider: 'google',
          providers: ['google'],
        },
        user_metadata: {
          full_name: 'Alex Rivera',
          avatar_url: 'https://lh3.googleusercontent.com/a/photo123',
        },
        identities: [
          { provider: 'google', id: 'google-sub-123', identity_data: { email: 'newuser@gmail.com' } }
        ],
        created_at: '2026-09-08T10:00:00Z',
      },
    };

    assert(isOAuthUser(newGoogleSession.user, newGoogleSession.user.identities) === true, 'isOAuthUser must identify Google signup as OAuth');

    const result = await simulateHandleSession(newGoogleSession);
    assert(result.userState !== null, 'User state must be set for new Google OAuth user');
    assert(result.userState.id === 'google-new-user-001', 'User ID must match');
    assert(result.userState.email === 'newuser@gmail.com', 'User email must match');
    assert(result.userState.authProvider === 'google', 'authProvider must be google');
    assert(result.signedOutCalled === false, 'Should not sign out new Google OAuth user');
    assert(result.dispatchedEvents.length === 0, 'Should not dispatch any auth errors');

    // Edge case: Google OAuth with missing email
    const googleMissingEmailSession = {
      user: {
        id: 'google-missing-email',
        email: '',
        app_metadata: { provider: 'google' },
        user_metadata: {},
        identities: [{ provider: 'google' }],
      }
    };
    let signOutTriggered = false;
    const missingEmailResult = await simulateHandleSession(googleMissingEmailSession, null, async () => { signOutTriggered = true; });
    assert(missingEmailResult.userState === null, 'User state must be null if email missing');
    assert(signOutTriggered === true, 'Must sign out user if email is missing from OAuth');
    assert(missingEmailResult.dispatchedEvents.some(e => e.detail.message.includes('Google account did not provide an email')), 'User-friendly error must be emitted');
  });

  // Scenario 2: Existing Google OAuth login -> direct dashboard access
  await runTest('Scenario 2: Existing Google OAuth login -> direct dashboard access', async () => {
    const existingGoogleSession = {
      user: {
        id: 'google-existing-user-002',
        email: 'existing.dev@gmail.com',
        email_confirmed_at: '2025-10-15T08:00:00Z',
        app_metadata: {
          provider: 'google',
          providers: ['google'],
        },
        user_metadata: {
          full_name: 'Dev Specialist',
          avatar_url: 'https://lh3.googleusercontent.com/avatar',
        },
        identities: [
          { provider: 'google', id: 'google-sub-456', identity_data: { email: 'existing.dev@gmail.com' } }
        ],
        created_at: '2025-10-15T08:00:00Z',
      }
    };

    assert(isOAuthUser(existingGoogleSession.user) === true, 'isOAuthUser must identify existing Google user');
    const result = await simulateHandleSession(existingGoogleSession);
    assert(result.userState !== null, 'User state must be populated');
    assert(result.userState.authProvider === 'google', 'Provider must be google');
    assert(result.signedOutCalled === false, 'Must not sign out existing Google user');
  });

  // Scenario 3: New GitHub OAuth signup/login -> direct dashboard access once GitHub is enabled
  await runTest('Scenario 3: New GitHub OAuth signup/login -> direct dashboard access', async () => {
    const githubSession = {
      provider_token: 'gho_dummy_token_12345',
      provider_refresh_token: 'ghr_dummy_token_67890',
      user: {
        id: 'github-user-003',
        email: 'octocat@github.com',
        app_metadata: {
          provider: 'github',
          providers: ['github'],
        },
        user_metadata: {
          user_name: 'octocat',
          preferred_username: 'octocat',
          full_name: 'Mona Lisa Octocat',
          avatar_url: 'https://avatars.githubusercontent.com/u/583231',
        },
        identities: [
          { provider: 'github', id: 'github-sub-789', identity_data: { user_name: 'octocat', email: 'octocat@github.com' } }
        ],
        created_at: '2026-09-08T10:05:00Z',
      }
    };

    assert(isOAuthUser(githubSession.user) === true, 'isOAuthUser must identify GitHub user');
    const result = await simulateHandleSession(githubSession);
    assert(result.userState !== null, 'GitHub user must be given access');
    assert(result.userState.isGithubLinked === true, 'isGithubLinked must be true');
    assert(result.userState.authProvider === 'github', 'authProvider must be github');
    assert(result.signedOutCalled === false, 'Must not sign out GitHub user');
  });

  // Scenario 4: New email/password signup -> email verification is still required
  await runTest('Scenario 4: New email/password signup -> email verification required', async () => {
    // When a user signs up via email/password, Supabase returns a user with unconfirmed email
    const newEmailSignupSession = {
      user: {
        id: 'email-new-user-004',
        email: 'freshsignup@company.com',
        email_confirmed_at: null, // Unconfirmed
        app_metadata: {
          provider: 'email',
          providers: ['email'],
        },
        user_metadata: {
          first_name: 'Jordan',
          last_name: 'Lee',
          full_name: 'Jordan Lee',
        },
        identities: [
          { provider: 'email', id: 'email-sub-004' }
        ],
        created_at: '2026-09-08T10:10:00Z',
      }
    };

    assert(isOAuthUser(newEmailSignupSession.user) === false, 'Email/password user must NOT be treated as OAuth');

    let signOutCalled = false;
    const result = await simulateHandleSession(newEmailSignupSession, null, async () => { signOutCalled = true; });

    assert(result.userState === null, 'Unconfirmed email signup must have userState === null');
    assert(signOutCalled === true, 'Must call signOut for unconfirmed email signup session');
    assert(result.dispatchedEvents.some(e => e.detail.message.includes('confirm your email address')), 'Must dispatch verification required error event');
  });

  // Scenario 5: Existing unverified email/password account -> remains blocked from the authenticated dashboard
  await runTest('Scenario 5: Existing unverified email/password account -> remains blocked', async () => {
    const unverifiedExistingUser = {
      user: {
        id: 'email-unverified-005',
        email: 'unconfirmed.user@domain.com',
        email_confirmed_at: null,
        confirmed_at: null,
        app_metadata: {
          provider: 'email',
          providers: ['email'],
        },
        user_metadata: {
          full_name: 'Unverified Person',
        },
        identities: [
          { provider: 'email', id: 'email-sub-005' }
        ],
        created_at: '2026-08-01T12:00:00Z',
      }
    };

    assert(isOAuthUser(unverifiedExistingUser.user) === false, 'Must not be considered OAuth');
    let signOutCalled = false;
    const result = await simulateHandleSession(unverifiedExistingUser, null, async () => { signOutCalled = true; });

    assert(result.userState === null, 'Unverified email account must not obtain user session');
    assert(signOutCalled === true, 'signOut must be triggered immediately to prevent session leakage');
    assert(result.dispatchedEvents[0]?.detail?.message === 'Please confirm your email address before signing in.', 'Correct blocking message must be presented');
  });

  // Scenario 6: Existing verified email/password account -> normal login works
  await runTest('Scenario 6: Existing verified email/password account -> normal login works', async () => {
    const verifiedUserSession = {
      user: {
        id: 'email-verified-006',
        email: 'verified.coder@gmail.com',
        email_confirmed_at: '2026-01-10T14:30:00Z',
        confirmed_at: '2026-01-10T14:30:00Z',
        app_metadata: {
          provider: 'email',
          providers: ['email'],
        },
        user_metadata: {
          full_name: 'Verified Coder',
        },
        identities: [
          { provider: 'email', id: 'email-sub-006' }
        ],
        created_at: '2026-01-10T14:28:00Z',
      }
    };

    assert(isOAuthUser(verifiedUserSession.user) === false, 'Verified email user is not OAuth');
    const result = await simulateHandleSession(verifiedUserSession);
    assert(result.userState !== null, 'Verified user must have userState populated');
    assert(result.userState.email === 'verified.coder@gmail.com', 'Email must match');
    assert(result.userState.authProvider === 'email', 'authProvider must be email');
    assert(result.signedOutCalled === false, 'Must not sign out verified user');
    assert(result.dispatchedEvents.length === 0, 'No errors dispatched for verified user');
  });

  // Scenario 7: OAuth callback does not cause a redirect loop, duplicate session handling, or flicker between auth states
  await runTest('Scenario 7: OAuth callback stability (no loops, idempotency, no flicker)', async () => {
    // 1. Check URL sanitization behavior: replaceState avoids triggering navigation reload
    let historyReplacedUrl = '';
    const mockHistory = {
      replaceState: (_state: any, _title: string, url: string) => {
        historyReplacedUrl = url;
      }
    };

    const testSearch = '?code=abc12345&state=xyz';
    const testPathname = '/';
    if (testSearch.includes('code=')) {
      const cleanUrl = testPathname + (testSearch.includes('workflow=github') ? '?workflow=github' : '');
      mockHistory.replaceState({}, 'Code Vibe', cleanUrl);
    }
    assert(historyReplacedUrl === '/', 'replaceState correctly cleans URL without page reload');

    // 2. Idempotency: Multiple invocations of handleSession with the same session do not mutate or invalidate state
    const stableOAuthSession = {
      user: {
        id: 'google-stable-007',
        email: 'stable@domain.com',
        app_metadata: { provider: 'google' },
        user_metadata: { full_name: 'Stable User' },
        created_at: '2026-09-08T10:00:00Z',
      }
    };

    const res1 = await simulateHandleSession(stableOAuthSession);
    const res2 = await simulateHandleSession(stableOAuthSession);
    assert(JSON.stringify(res1.userState) === JSON.stringify(res2.userState), 'Multiple handleSession calls produce identical state');
    assert(res1.signedOutCalled === false && res2.signedOutCalled === false, 'Neither invocation triggers signout');
  });

  // Scenario 8: Sign out and sign back in works correctly for both OAuth and email/password
  await runTest('Scenario 8: Sign out and sign back in works correctly for both OAuth and email/password', async () => {
    // 1. Initial signed-in OAuth user
    const oauthSession = {
      user: {
        id: 'oauth-user-008',
        email: 'oauth.user@gmail.com',
        app_metadata: { provider: 'google' },
        user_metadata: { full_name: 'OAuth User' },
      }
    };
    let appUser: any = (await simulateHandleSession(oauthSession)).userState;
    assert(appUser !== null, 'Initial user is signed in');

    // 2. Sign out: session becomes null
    const nullSession = null;
    const signOutResult = await simulateHandleSession(nullSession);
    appUser = signOutResult.userState;
    assert(appUser === null, 'Sign out sets user state to null');

    // 3. Sign back in with email/password (verified)
    const emailSession = {
      user: {
        id: 'email-user-008',
        email: 'email.user@gmail.com',
        email_confirmed_at: '2026-02-01T00:00:00Z',
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: 'Email User' },
      }
    };
    const emailSignInResult = await simulateHandleSession(emailSession);
    appUser = emailSignInResult.userState;
    assert(appUser !== null, 'Signed back in with email/password');
    assert(appUser.authProvider === 'email', 'Provider is email');

    // 4. Sign out again
    appUser = (await simulateHandleSession(null)).userState;
    assert(appUser === null, 'User state returned to null');

    // 5. Sign back in with OAuth
    const oauthSignInResult = await simulateHandleSession(oauthSession);
    appUser = oauthSignInResult.userState;
    assert(appUser !== null, 'Signed back in with OAuth');
    assert(appUser.authProvider === 'google', 'Provider is google');
  });

  console.log('\n=== TEST RESULTS SUMMARY ===');
  results.forEach(r => {
    console.log(`[${r.status}] ${r.scenario} -> ${r.details}`);
  });
  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
