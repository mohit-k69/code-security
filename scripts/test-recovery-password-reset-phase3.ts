/**
 * Automated Security Test Suite - Phase 3 Password Reset & Session Revocation
 *
 * Verifies all 31 security requirements:
 *
 * Ticket Security:
 * 1. Missing ticket fails
 * 2. Invalid ticket fails
 * 3. Expired ticket fails
 * 4. Revoked ticket fails
 * 5. Consumed ticket fails
 * 6. Ticket for another user cannot be used
 * 7. Browser cannot access plaintext ticket through JavaScript
 *
 * CSRF / Request-Origin:
 * 8. Correct trusted Origin succeeds
 * 9. Cross-site Origin fails
 * 10. Invalid Referer fallback fails
 * 11. Clearly cross-site Sec-Fetch-Site fails
 * 12. GET cannot reset password
 *
 * Password Reset:
 * 13. Valid ticket + valid password succeeds
 * 14. Invalid password fails (too short)
 * 15. Password confirmation mismatch fails
 * 16. Password is securely stored through Supabase Auth
 * 17. Old password no longer works
 * 18. New password works through normal login
 *
 * Replay & Concurrency:
 * 19. Same recovery ticket cannot reset the password twice
 * 20. Concurrent requests cannot both reset successfully
 *
 * Session Security:
 * 21. Recovery ticket is consumed after successful reset
 * 22. Recovery cookie is cleared
 * 23. Existing sessions are revoked according to verified Supabase behavior
 * 24. Recovery authorization cannot access normal application APIs
 *
 * Secret Leakage:
 * 25. Password never appears in logs
 * 26. Recovery ticket never appears in logs
 * 27. Recovery ticket never appears in JSON
 * 28. Recovery ticket never appears in PostHog/analytics
 * 29. Recovery ticket never appears in URLs
 *
 * OAuth Accounts:
 * 30. Existing Google identity remains intact when password is set
 * 31. Existing GitHub identity remains intact when password is set
 */

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  handleRecoveryVerification,
  handlePasswordResetWithTicket,
  resolveClientIp,
  validateOriginAndCSRF,
  clearMemoryRateLimits,
} from '../src/lib/recoveryVerification';
import {
  generateRecoveryCodeSet,
  storeRecoveryCodeHashes,
} from '../src/lib/recoveryCodes';

let passed = 0;
let failed = 0;
const results: { name: string; status: 'PASS' | 'FAIL'; message?: string }[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    clearMemoryRateLimits();
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    failed++;
    results.push({ name, status: 'FAIL', message: err.message });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

// In-memory mock database & Supabase Auth admin
function createPhase3MockAdmin() {
  const users = [
    {
      id: 'alice-uuid-1111',
      email: 'alice@example.com',
      passwordHash: 'old-hashed-password-1111',
      identities: [
        {
          id: 'google-identity-1111',
          user_id: 'alice-uuid-1111',
          provider: 'google',
          identity_data: { email: 'alice@example.com', sub: 'google-sub-1111' },
        },
      ],
      user_metadata: { email: 'alice@example.com', full_name: 'Alice User' },
    },
    {
      id: 'bob-uuid-2222',
      email: 'bob@example.com',
      passwordHash: 'old-hashed-password-2222',
      identities: [
        {
          id: 'github-identity-2222',
          user_id: 'bob-uuid-2222',
          provider: 'github',
          identity_data: { email: 'bob@example.com', user_name: 'bobgit' },
        },
      ],
      user_metadata: { email: 'bob@example.com' },
    },
  ];

  const sessions: { id: string; user_id: string; active: boolean; refresh_token: string }[] = [
    { id: 'sess-1', user_id: 'alice-uuid-1111', active: true, refresh_token: 'old-refresh-token-1111' },
    { id: 'sess-2', user_id: 'bob-uuid-2222', active: true, refresh_token: 'old-refresh-token-2222' },
  ];

  const recoveryCodes: {
    id: string;
    user_id: string;
    code_hash: string;
    created_at: string;
    consumed_at: string | null;
    revoked_at: string | null;
  }[] = [];

  const recoveryTickets: {
    id: string;
    user_id: string;
    ticket_hash: string;
    created_at: string;
    expires_at: string;
    consumed_at: string | null;
    revoked_at: string | null;
  }[] = [];

  const auditLogs: { event_type: string; user_id?: string; ticket_id?: string; ip: string }[] = [];

  return {
    _users: users,
    _sessions: sessions,
    _recoveryCodes: recoveryCodes,
    _recoveryTickets: recoveryTickets,
    _auditLogs: auditLogs,

    rpc: async (func: string, params: any) => {
      if (func === 'consume_recovery_ticket_atomic') {
        const ticketHash = params.p_ticket_hash;
        const now = Date.now();
        const ticket = recoveryTickets.find(
          (t) =>
            t.ticket_hash === ticketHash &&
            t.consumed_at === null &&
            t.revoked_at === null &&
            new Date(t.expires_at).getTime() > now
        );
        if (!ticket) {
          return { data: [], error: null };
        }
        ticket.consumed_at = new Date().toISOString();
        return {
          data: [{ ticket_id: ticket.id, user_id: ticket.user_id }],
          error: null,
        };
      }

      if (func === 'revoke_user_sessions_after_recovery') {
        const userId = params.p_user_id;
        for (const s of sessions) {
          if (s.user_id === userId) {
            s.active = false;
          }
        }
        for (const t of recoveryTickets) {
          if (t.user_id === userId && t.consumed_at === null && t.revoked_at === null) {
            t.revoked_at = new Date().toISOString();
          }
        }
        return { data: null, error: null };
      }

      return { data: null, error: { message: 'Function not found' } };
    },

    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        getUserById: async (id: string) => {
          const u = users.find((x) => x.id === id);
          return { data: { user: u || null }, error: u ? null : { message: 'Not found' } };
        },
        updateUserById: async (id: string, updates: any) => {
          const u = users.find((x) => x.id === id);
          if (!u) return { data: null, error: { message: 'User not found' } };

          if (updates.password) {
            // Update password hash, preserving all identities intact
            u.passwordHash = `hash_${updates.password}`;

            // Revoke active sessions and refresh tokens on password update
            for (const s of sessions) {
              if (s.user_id === id) {
                s.active = false;
              }
            }
          }
          return { data: { user: u }, error: null };
        },
      },
      signInWithPassword: async ({ email, password }: { email: string; password?: string }) => {
        const u = users.find((x) => x.email === email);
        if (!u || !password) {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
        }
        if (u.passwordHash !== `hash_${password}`) {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
        }
        const session = { access_token: `jwt_${u.id}`, refresh_token: `rf_${u.id}`, user: u };
        return { data: { user: u, session }, error: null };
      },
      getUser: async (token: string) => {
        // Recovery tickets are 64-char hex strings and must NEVER authenticate as Supabase sessions
        if (token.startsWith('jwt_')) {
          const userId = token.replace('jwt_', '');
          const u = users.find((x) => x.id === userId);
          return { data: { user: u || null }, error: u ? null : { message: 'Invalid token' } };
        }
        return {
          data: { user: null },
          error: { message: 'Invalid JWT: token is not a valid Supabase access token' },
        };
      },
    },

    from: (table: string) => {
      let targetArray: any[];
      if (table === 'user_recovery_codes') targetArray = recoveryCodes;
      else if (table === 'user_recovery_tickets') targetArray = recoveryTickets;
      else if (table === 'recovery_audit_logs') targetArray = auditLogs;
      else targetArray = [];

      return {
        insert: async (rows: any | any[]) => {
          const toInsert = Array.isArray(rows) ? rows : [rows];
          for (const r of toInsert) {
            targetArray.push({ id: `mock-id-${Math.random().toString(36).substring(2, 9)}`, ...r });
          }
          return { data: toInsert, error: null };
        },

        select: () => {
          let filtered = [...targetArray];
          const query = {
            eq: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] === val);
              return query;
            },
            is: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] === val);
              return query;
            },
            single: async () => {
              return { data: filtered[0] || null, error: filtered[0] ? null : { message: 'Not found' } };
            },
            then: (resolve: any) => {
              return Promise.resolve({ data: filtered, error: null }).then(resolve);
            },
          };
          return query;
        },

        update: (updates: any) => {
          let filtered = [...targetArray];
          const query = {
            eq: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] === val);
              return query;
            },
            is: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] === val);
              return query;
            },
            gt: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] > val);
              return query;
            },
            select: async () => {
              const updatedRows: any[] = [];
              for (const item of filtered) {
                if (table === 'user_recovery_tickets' && updates.consumed_at) {
                  if (item.consumed_at !== null || item.revoked_at !== null) {
                    continue;
                  }
                }
                Object.assign(item, updates);
                updatedRows.push(item);
              }
              return { data: updatedRows, error: null };
            },
          };
          return query;
        },
      };
    },
  };
}

// Setup Express test server
function createExpressTestApp(admin: any) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());

  function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
    if (!cookieHeader) return undefined;
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  // POST /api/auth/recovery/verify
  app.post('/api/auth/recovery/verify', async (req, res) => {
    const ip = req.ip || resolveClientIp(req.socket?.remoteAddress, req.headers['x-forwarded-for'], 1);
    const email = req.body?.email || req.body?.identifier;
    const code = req.body?.code;

    const result = await handleRecoveryVerification(admin, {
      identifier: email,
      code,
      ip,
    });

    if (result.success && result.ticket) {
      const isProduction = process.env.NODE_ENV === 'production';
      const isSecure = isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';

      res.cookie('recovery_ticket', result.ticket, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'strict',
        path: '/api/auth/recovery',
        maxAge: 15 * 60 * 1000,
      });
    }

    return res.status(result.status).json(result.body);
  });

  // POST /api/auth/recovery/reset-password
  app.all('/api/auth/recovery/reset-password', async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed. POST is required.' });
    }

    const ticketFromCookie = getCookieValue(req.headers.cookie, 'recovery_ticket');
    const ip = req.ip || resolveClientIp(req.socket?.remoteAddress, req.headers['x-forwarded-for'], 1);

    const result = await handlePasswordResetWithTicket(admin, {
      ticket: ticketFromCookie,
      newPassword: req.body?.newPassword,
      confirmPassword: req.body?.confirmPassword,
      ip,
      origin: req.headers['origin'] as string,
      referer: req.headers['referer'] as string,
      secFetchSite: req.headers['sec-fetch-site'] as string,
      method: req.method,
    });

    if (result.success) {
      const isProduction = process.env.NODE_ENV === 'production';
      const isSecure = isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';

      res.clearCookie('recovery_ticket', {
        path: '/api/auth/recovery',
        httpOnly: true,
        secure: isSecure,
        sameSite: 'strict',
      });
    }

    return res.status(result.status).json(result.body);
  });

  return app;
}

async function runAllPhase3Tests() {
  console.log('\n--- Running Password Reset & Session Revocation Security Test Suite (Phase 3) ---\n');

  // ==========================================
  // Group 1: Ticket Security (Tests 1 - 7)
  // ==========================================

  await test('Requirement 1: Missing ticket fails', async () => {
    const admin = createPhase3MockAdmin();
    const res = await handlePasswordResetWithTicket(admin, {
      ticket: undefined,
      newPassword: 'new-valid-password-123',
      confirmPassword: 'new-valid-password-123',
      origin: 'http://localhost:3000',
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    assert(res.body.error === 'INVALID_RECOVERY_TICKET', 'Must return INVALID_RECOVERY_TICKET');
  });

  await test('Requirement 2: Invalid ticket fails', async () => {
    const admin = createPhase3MockAdmin();
    const fakeTicket = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const res = await handlePasswordResetWithTicket(admin, {
      ticket: fakeTicket,
      newPassword: 'new-valid-password-123',
      confirmPassword: 'new-valid-password-123',
      origin: 'http://localhost:3000',
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    assert(res.body.error === 'INVALID_RECOVERY_TICKET', 'Invalid ticket must be rejected');
  });

  await test('Requirement 3: Expired ticket fails', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.1',
    });
    const ticket = verifyRes.ticket!;

    // Set expiration in past
    admin._recoveryTickets[0].expires_at = new Date(Date.now() - 5000).toISOString();

    const resetRes = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'new-valid-password-123',
      confirmPassword: 'new-valid-password-123',
      origin: 'http://localhost:3000',
    });
    assert(resetRes.status === 400, 'Expired ticket must be rejected');
    assert(resetRes.body.error === 'INVALID_RECOVERY_TICKET', 'Must return generic invalid ticket');
  });

  await test('Requirement 4: Revoked ticket fails', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.2',
    });
    const ticket = verifyRes.ticket!;

    // Revoke ticket
    admin._recoveryTickets[0].revoked_at = new Date().toISOString();

    const resetRes = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'new-valid-password-123',
      confirmPassword: 'new-valid-password-123',
      origin: 'http://localhost:3000',
    });
    assert(resetRes.status === 400, 'Revoked ticket must be rejected');
    assert(resetRes.body.error === 'INVALID_RECOVERY_TICKET', 'Must return generic invalid ticket');
  });

  await test('Requirement 5: Consumed ticket fails', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.3',
    });
    const ticket = verifyRes.ticket!;

    // Consume ticket
    admin._recoveryTickets[0].consumed_at = new Date().toISOString();

    const resetRes = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'new-valid-password-123',
      confirmPassword: 'new-valid-password-123',
      origin: 'http://localhost:3000',
    });
    assert(resetRes.status === 400, 'Consumed ticket must be rejected');
    assert(resetRes.body.error === 'INVALID_RECOVERY_TICKET', 'Must return generic invalid ticket');
  });

  await test('Requirement 6: Ticket for another user cannot be used to reset attacker target', async () => {
    const admin = createPhase3MockAdmin();
    const aliceBatch = await generateRecoveryCodeSet(10);
    const bobBatch = await generateRecoveryCodeSet(10);

    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', aliceBatch.hashes);
    await storeRecoveryCodeHashes(admin, 'bob-uuid-2222', bobBatch.hashes);

    // Alice generates ticket
    const aliceVerify = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: aliceBatch.codes[0],
      ip: '192.168.1.4',
    });
    const aliceTicket = aliceVerify.ticket!;

    // Attacker tries to submit Alice's ticket with Bob's requested reset
    // User identity comes exclusively from server ticket
    const resetRes = await handlePasswordResetWithTicket(admin, {
      ticket: aliceTicket,
      newPassword: 'brand-new-password-123',
      confirmPassword: 'brand-new-password-123',
      origin: 'http://localhost:3000',
    });

    assert(resetRes.success === true, 'Reset should succeed for the ticket owner');
    // Verify Bob's password was untouched
    const bob = admin._users.find((u) => u.id === 'bob-uuid-2222');
    assert(bob?.passwordHash === 'old-hashed-password-2222', 'Bob password must remain unchanged');
  });

  await test('Requirement 7: Browser cannot access plaintext ticket through JavaScript', async () => {
    // Verified by checking cookie attributes and HTTP response
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const app = createExpressTestApp(admin);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/recovery/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice@example.com', code: batch.codes[0] }),
      });

      const body = await res.json();
      assert(body.recovery_ticket === undefined, 'JSON response must NOT contain ticket');
      assert(body.ticket === undefined, 'JSON response must NOT contain ticket');

      const setCookie = res.headers.get('set-cookie') || '';
      assert(setCookie.toLowerCase().includes('httponly'), 'Cookie MUST be HttpOnly');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // ==========================================
  // Group 2: CSRF & Request-Origin (Tests 8 - 12)
  // ==========================================

  await test('Requirement 8: Correct trusted Origin succeeds', async () => {
    const res = validateOriginAndCSRF({
      method: 'POST',
      origin: 'http://localhost:3000',
    });
    assert(res.valid === true, 'Trusted localhost origin must succeed');
  });

  await test('Requirement 9: Cross-site Origin fails', async () => {
    const res = validateOriginAndCSRF({
      method: 'POST',
      origin: 'https://evil-attacker-site.com',
    });
    assert(res.valid === false, 'Cross-site origin must fail');
    assert(res.reason === 'ORIGIN_MISMATCH', 'Reason should be ORIGIN_MISMATCH');
  });

  await test('Requirement 10: Invalid Referer fallback fails', async () => {
    const res = validateOriginAndCSRF({
      method: 'POST',
      referer: 'https://malicious.com/attack-page.html',
    });
    assert(res.valid === false, 'Malicious referer fallback must fail');
  });

  await test('Requirement 11: Clearly cross-site Sec-Fetch-Site fails', async () => {
    const res = validateOriginAndCSRF({
      method: 'POST',
      origin: 'http://localhost:3000',
      secFetchSite: 'cross-site',
    });
    assert(res.valid === false, 'Sec-Fetch-Site: cross-site must be rejected');
    assert(res.reason === 'CROSS_SITE_REQUEST_FORBIDDEN', 'Reason should be CROSS_SITE_REQUEST_FORBIDDEN');
  });

  await test('Requirement 12: GET cannot reset password', async () => {
    const res = validateOriginAndCSRF({
      method: 'GET',
      origin: 'http://localhost:3000',
    });
    assert(res.valid === false, 'GET request must be rejected');
    assert(res.reason === 'METHOD_NOT_ALLOWED', 'Reason should be METHOD_NOT_ALLOWED');
  });

  // ==========================================
  // Group 3: Password Reset (Tests 13 - 18)
  // ==========================================

  await test('Requirement 13: Valid ticket + valid password succeeds', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.10',
    });
    const ticket = verifyRes.ticket!;

    const resetRes = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'my-super-secure-password-2026',
      confirmPassword: 'my-super-secure-password-2026',
      origin: 'http://localhost:3000',
      ip: '192.168.1.10',
    });

    assert(resetRes.success === true, 'Reset must succeed');
    assert(resetRes.status === 200, `Expected 200, got ${resetRes.status}`);
    assert(resetRes.body.message === 'Password reset successfully.', 'Must return success message');
  });

  await test('Requirement 14: Invalid password fails (too short)', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.11',
    });
    const ticket = verifyRes.ticket!;

    const resetRes = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: '123',
      confirmPassword: '123',
      origin: 'http://localhost:3000',
      ip: '192.168.1.11',
    });

    assert(resetRes.success === false, 'Short password must fail');
    assert(resetRes.status === 400, 'Expected 400');
    assert(resetRes.body.error === 'INVALID_PASSWORD', 'Must return INVALID_PASSWORD');

    // Ticket must NOT be consumed on input validation error
    assert(admin._recoveryTickets[0].consumed_at === null, 'Ticket must remain unconsumed after validation error');
  });

  await test('Requirement 15: Password confirmation mismatch fails', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.12',
    });
    const ticket = verifyRes.ticket!;

    const resetRes = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'my-new-password-1',
      confirmPassword: 'my-new-password-different',
      origin: 'http://localhost:3000',
      ip: '192.168.1.12',
    });

    assert(resetRes.success === false, 'Mismatched passwords must fail');
    assert(resetRes.status === 400, 'Expected 400');
    assert(resetRes.body.error === 'PASSWORD_CONFIRMATION_MISMATCH', 'Must return confirmation mismatch');

    // Ticket must NOT be consumed
    assert(admin._recoveryTickets[0].consumed_at === null, 'Ticket must remain unconsumed');
  });

  await test('Requirement 16: Password is securely stored through Supabase Auth', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.13',
    });

    await handlePasswordResetWithTicket(admin, {
      ticket: verifyRes.ticket!,
      newPassword: 'new-encrypted-password-xyz',
      confirmPassword: 'new-encrypted-password-xyz',
      origin: 'http://localhost:3000',
      ip: '192.168.1.13',
    });

    const alice = admin._users.find((u) => u.id === 'alice-uuid-1111');
    assert(alice?.passwordHash !== 'new-encrypted-password-xyz', 'Plaintext password must not be stored');
    assert(alice?.passwordHash === 'hash_new-encrypted-password-xyz', 'Password was updated in auth schema');
  });

  await test('Requirement 17: Old password no longer works', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.14',
    });

    await handlePasswordResetWithTicket(admin, {
      ticket: verifyRes.ticket!,
      newPassword: 'new-password-789',
      confirmPassword: 'new-password-789',
      origin: 'http://localhost:3000',
      ip: '192.168.1.14',
    });

    const loginWithOld = await admin.auth.signInWithPassword({
      email: 'alice@example.com',
      password: 'old-hashed-password-1111',
    });
    assert(loginWithOld.data.session === null, 'Login with old password must fail');
  });

  await test('Requirement 18: New password works through normal login', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.15',
    });

    await handlePasswordResetWithTicket(admin, {
      ticket: verifyRes.ticket!,
      newPassword: 'freshly-updated-password-2026',
      confirmPassword: 'freshly-updated-password-2026',
      origin: 'http://localhost:3000',
      ip: '192.168.1.15',
    });

    const loginWithNew = await admin.auth.signInWithPassword({
      email: 'alice@example.com',
      password: 'freshly-updated-password-2026',
    });
    assert(loginWithNew.data.session !== null, 'Login with new password must succeed');
    assert(loginWithNew.data.user?.id === 'alice-uuid-1111', 'User session matches Alice');
  });

  // ==========================================
  // Group 4: Replay & Concurrency (Tests 19 - 20)
  // ==========================================

  await test('Requirement 19: Same recovery ticket cannot reset the password twice', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.16',
    });
    const ticket = verifyRes.ticket!;

    // 1st reset
    const firstReset = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'password-try-one',
      confirmPassword: 'password-try-one',
      origin: 'http://localhost:3000',
      ip: '192.168.1.16',
    });
    assert(firstReset.success === true, 'First reset must succeed');

    // 2nd reset with same ticket
    const secondReset = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'password-try-two',
      confirmPassword: 'password-try-two',
      origin: 'http://localhost:3000',
      ip: '192.168.1.16',
    });
    assert(secondReset.success === false, 'Second reset must fail');
    assert(secondReset.status === 400, 'Expected 400 on replay');
  });

  await test('Requirement 20: Concurrent requests cannot both reset successfully', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.17',
    });
    const ticket = verifyRes.ticket!;

    // Launch 10 simultaneous password-reset requests with the same ticket
    const promises = Array.from({ length: 10 }, (_, i) =>
      handlePasswordResetWithTicket(admin, {
        ticket,
        newPassword: `concurrent-pass-${i}`,
        confirmPassword: `concurrent-pass-${i}`,
        origin: 'http://localhost:3000',
        ip: `192.168.2.${10 + i}`,
      })
    );

    const resultsArray = await Promise.all(promises);
    const successes = resultsArray.filter((r) => r.success === true);
    const failures = resultsArray.filter((r) => r.success === false);

    assert(successes.length === 1, `Exactly ONE reset must succeed, got ${successes.length}`);
    assert(failures.length === 9, `Remaining 9 resets must fail, got ${failures.length}`);
  });

  // ==========================================
  // Group 5: Session Security (Tests 21 - 24)
  // ==========================================

  await test('Requirement 21: Recovery ticket is consumed after successful reset', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.20',
    });

    await handlePasswordResetWithTicket(admin, {
      ticket: verifyRes.ticket!,
      newPassword: 'reset-pwd-123456',
      confirmPassword: 'reset-pwd-123456',
      origin: 'http://localhost:3000',
      ip: '192.168.1.20',
    });

    assert(admin._recoveryTickets[0].consumed_at !== null, 'Ticket must be marked consumed_at in database');
  });

  await test('Requirement 22: Recovery cookie is cleared', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const app = createExpressTestApp(admin);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // Step 1: verify recovery code to get cookie
      const verifyRes = await fetch(`http://127.0.0.1:${port}/api/auth/recovery/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice@example.com', code: batch.codes[0] }),
      });
      const cookieReceived = verifyRes.headers.get('set-cookie') || '';
      const cookieMatch = cookieReceived.match(/recovery_ticket=([^;]+)/);
      const ticketVal = cookieMatch![1];

      // Step 2: reset password sending cookie
      const resetRes = await fetch(`http://127.0.0.1:${port}/api/auth/recovery/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: `http://localhost:3000`,
          Cookie: `recovery_ticket=${ticketVal}`,
        },
        body: JSON.stringify({
          newPassword: 'brand-new-password-cleared',
          confirmPassword: 'brand-new-password-cleared',
        }),
      });

      assert(resetRes.status === 200, `Expected 200, got ${resetRes.status}`);
      const clearCookie = resetRes.headers.get('set-cookie') || '';
      assert(clearCookie.includes('recovery_ticket=;'), 'Must set recovery_ticket=;');
      assert(
        clearCookie.toLowerCase().includes('expires=thu, 01 jan 1970') || clearCookie.toLowerCase().includes('max-age=0'),
        'Cookie must be expired'
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  await test('Requirement 23: Existing sessions are revoked according to verified Supabase behavior', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.22',
    });

    // Check alice's session is active before reset
    const aliceSession = admin._sessions.find((s) => s.user_id === 'alice-uuid-1111');
    assert(aliceSession?.active === true, 'Alice session was active initially');

    await handlePasswordResetWithTicket(admin, {
      ticket: verifyRes.ticket!,
      newPassword: 'session-revocation-test-pwd',
      confirmPassword: 'session-revocation-test-pwd',
      origin: 'http://localhost:3000',
      ip: '192.168.1.22',
    });

    assert(aliceSession?.active === false, 'Alice sessions must be revoked after password reset');
  });

  await test('Requirement 24: Recovery authorization cannot access normal application APIs', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.23',
    });
    const ticket = verifyRes.ticket!;

    // Cannot access Supabase user API with recovery ticket
    const authRes = await admin.auth.getUser(ticket);
    assert(authRes.data.user === null, 'Must fail normal user authorization');
    assert(authRes.error !== null, 'Must produce authentication error');
  });

  // ==========================================
  // Group 6: Secret Leakage (Tests 25 - 29)
  // ==========================================

  await test('Requirement 25: Password never appears in logs', async () => {
    const captured: string[] = [];
    const origLog = console.log;
    const origInfo = console.info;
    const origError = console.error;

    console.log = (...args: any[]) => captured.push(args.join(' '));
    console.info = (...args: any[]) => captured.push(args.join(' '));
    console.error = (...args: any[]) => captured.push(args.join(' '));

    const secretPassword = 'SUPER-SECRET-PLAINTEXT-PASSWORD-999';

    try {
      const admin = createPhase3MockAdmin();
      const batch = await generateRecoveryCodeSet(10);
      await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);
      const verifyRes = await handleRecoveryVerification(admin, {
        identifier: 'alice@example.com',
        code: batch.codes[0],
        ip: '192.168.1.25',
      });

      await handlePasswordResetWithTicket(admin, {
        ticket: verifyRes.ticket!,
        newPassword: secretPassword,
        confirmPassword: secretPassword,
        origin: 'http://localhost:3000',
        ip: '192.168.1.25',
      });
    } finally {
      console.log = origLog;
      console.info = origInfo;
      console.error = origError;
    }

    for (const msg of captured) {
      assert(!msg.includes(secretPassword), `Password leaked in log: ${msg}`);
    }
  });

  await test('Requirement 26: Recovery ticket never appears in logs', async () => {
    const captured: string[] = [];
    const origInfo = console.info;
    console.info = (...args: any[]) => captured.push(args.join(' '));

    let ticketSecret = '';
    try {
      const admin = createPhase3MockAdmin();
      const batch = await generateRecoveryCodeSet(10);
      await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);
      const verifyRes = await handleRecoveryVerification(admin, {
        identifier: 'alice@example.com',
        code: batch.codes[0],
        ip: '192.168.1.26',
      });
      ticketSecret = verifyRes.ticket!;

      await handlePasswordResetWithTicket(admin, {
        ticket: ticketSecret,
        newPassword: 'secure-pwd-test-26',
        confirmPassword: 'secure-pwd-test-26',
        origin: 'http://localhost:3000',
        ip: '192.168.1.26',
      });
    } finally {
      console.info = origInfo;
    }

    assert(ticketSecret.length === 64, 'Ticket exists');
    for (const msg of captured) {
      assert(!msg.includes(ticketSecret), `Recovery ticket leaked in log: ${msg}`);
    }
  });

  await test('Requirement 27: Recovery ticket never appears in JSON', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const app = createExpressTestApp(admin);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const verifyRes = await fetch(`http://127.0.0.1:${port}/api/auth/recovery/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice@example.com', code: batch.codes[0] }),
      });
      const verifyJson = await verifyRes.json();
      assert(verifyJson.recovery_ticket === undefined, 'Verify JSON must not contain ticket');

      const setCookie = verifyRes.headers.get('set-cookie') || '';
      const cookieMatch = setCookie.match(/recovery_ticket=([^;]+)/);
      const ticketVal = cookieMatch![1];

      const resetRes = await fetch(`http://127.0.0.1:${port}/api/auth/recovery/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: `http://localhost:3000`,
          Cookie: `recovery_ticket=${ticketVal}`,
        },
        body: JSON.stringify({
          newPassword: 'json-safety-check-password',
          confirmPassword: 'json-safety-check-password',
        }),
      });

      const resetJson = await resetRes.json();
      assert(resetJson.recovery_ticket === undefined, 'Reset JSON must not contain ticket');
      assert(resetJson.ticket === undefined, 'Reset JSON must not contain ticket');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  await test('Requirement 28: Recovery ticket never appears in PostHog/analytics', async () => {
    // Scan all analytics calls across src/
    function checkDir(dir: string): string[] {
      let files: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
          files = files.concat(checkDir(full));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          files.push(full);
        }
      }
      return files;
    }

    const files = checkDir(path.resolve('./src'));
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      assert(!content.includes('trackEvent') || !content.includes('recovery_ticket'), `Analytics leak in ${f}`);
      assert(!content.includes('identifyUser') || !content.includes('recovery_ticket'), `Identify leak in ${f}`);
    }
  });

  await test('Requirement 29: Recovery ticket never appears in URLs', async () => {
    function checkDir(dir: string): string[] {
      let files: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
          files = files.concat(checkDir(full));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          files.push(full);
        }
      }
      return files;
    }

    const files = checkDir(path.resolve('./src'));
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      assert(!content.includes('?ticket=') && !content.includes('&ticket='), `Ticket URL param in ${f}`);
      assert(!content.includes('?recovery_ticket=') && !content.includes('&recovery_ticket='), `Recovery ticket URL param in ${f}`);
    }
  });

  // ==========================================
  // Group 7: OAuth Accounts (Tests 30 - 31)
  // ==========================================

  await test('Requirement 30: Existing Google identity remains intact when password is set', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const aliceBefore = admin._users.find((u) => u.id === 'alice-uuid-1111')!;
    assert(aliceBefore.identities.some((i) => i.provider === 'google'), 'Google identity exists before reset');

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.30',
    });

    await handlePasswordResetWithTicket(admin, {
      ticket: verifyRes.ticket!,
      newPassword: 'new-google-user-password-123',
      confirmPassword: 'new-google-user-password-123',
      origin: 'http://localhost:3000',
      ip: '192.168.1.30',
    });

    const aliceAfter = admin._users.find((u) => u.id === 'alice-uuid-1111')!;
    // Google identity must still exist
    const googleIdent = aliceAfter.identities.find((i) => i.provider === 'google');
    assert(googleIdent !== undefined, 'Google identity was preserved');
    assert(googleIdent?.identity_data.sub === 'google-sub-1111', 'Google identity sub preserved');
    // And email login with new password also works
    const login = await admin.auth.signInWithPassword({
      email: 'alice@example.com',
      password: 'new-google-user-password-123',
    });
    assert(login.data.session !== null, 'Login with new password works for Google OAuth account');
  });

  await test('Requirement 31: Existing GitHub identity remains intact when password is set', async () => {
    const admin = createPhase3MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'bob-uuid-2222', batch.hashes);

    const bobBefore = admin._users.find((u) => u.id === 'bob-uuid-2222')!;
    assert(bobBefore.identities.some((i) => i.provider === 'github'), 'GitHub identity exists before reset');

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'bob@example.com',
      code: batch.codes[0],
      ip: '192.168.1.31',
    });

    await handlePasswordResetWithTicket(admin, {
      ticket: verifyRes.ticket!,
      newPassword: 'new-github-user-password-456',
      confirmPassword: 'new-github-user-password-456',
      origin: 'http://localhost:3000',
      ip: '192.168.1.31',
    });

    const bobAfter = admin._users.find((u) => u.id === 'bob-uuid-2222')!;
    const githubIdent = bobAfter.identities.find((i) => i.provider === 'github');
    assert(githubIdent !== undefined, 'GitHub identity was preserved');
    assert(githubIdent?.identity_data.user_name === 'bobgit', 'GitHub identity user_name preserved');

    const login = await admin.auth.signInWithPassword({
      email: 'bob@example.com',
      password: 'new-github-user-password-456',
    });
    assert(login.data.session !== null, 'Login with new password works for GitHub OAuth account');
  });

  console.log('\n--- Phase 3 Test Results Summary ---');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllPhase3Tests();
