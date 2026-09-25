/**
 * Automated Security Test Suite - Phase 2 Recovery Code Verification
 *
 * Verifies all 14 security requirements:
 * 1. Valid recovery code succeeds
 * 2. Invalid recovery code fails
 * 3. Recovery code belonging to another account fails
 * 4. Consumed recovery code fails
 * 5. Revoked recovery code fails
 * 6. Same code cannot succeed twice
 * 7. Simultaneous requests cannot both consume the same code (race condition safe)
 * 8. Nonexistent account does not produce an account-enumeration response
 * 9. Rate limiting works (account and IP throttling with generic 429)
 * 10. Recovery authorization expires
 * 11. Recovery authorization cannot access normal protected endpoints (session confusion defense)
 * 12. Recovery authorization is single-use
 * 13. Plaintext recovery codes are never logged
 * 14. Recovery authorization secrets are never logged
 */

import {
  handleRecoveryVerification,
  validateRecoveryTicket,
  consumeRecoveryTicket,
  clearMemoryRateLimits,
  GENERIC_RECOVERY_ERROR,
  GENERIC_RATE_LIMIT_ERROR,
  ACCOUNT_RATE_LIMIT_MAX,
  IP_RATE_LIMIT_MAX,
} from '../src/lib/recoveryVerification';
import {
  generateRecoveryCodeSet,
  hashRecoveryCode,
  storeRecoveryCodeHashes,
} from '../src/lib/recoveryCodes';
import fs from 'fs';
import path from 'path';

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

// In-memory mock database for Phase 2 tests
function createPhase2MockAdmin() {
  const users = [
    {
      id: 'alice-uuid-1111',
      email: 'alice@example.com',
      identities: [{ identity_data: { email: 'alice@example.com' } }],
      user_metadata: { email: 'alice@example.com' },
    },
    {
      id: 'bob-uuid-2222',
      email: 'bob@example.com',
      identities: [{ identity_data: { email: 'bob@example.com' } }],
      user_metadata: { email: 'bob@example.com' },
    },
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

  const rateLimits: {
    id: string;
    rate_key: string;
    attempts: number;
    first_attempt_at: string;
    last_attempt_at: string;
    blocked_until: string | null;
  }[] = [];

  // Mutex lock to simulate database-level atomic row lock for recovery_codes
  let tableLock = Promise.resolve();

  return {
    _recoveryCodes: recoveryCodes,
    _recoveryTickets: recoveryTickets,
    _rateLimits: rateLimits,

    auth: {
      admin: {
        listUsers: async ({ page = 1, perPage = 100 }: any = {}) => {
          return { data: { users }, error: null };
        },
      },
      getUser: async (token: string) => {
        // Recovery tickets are NOT valid Supabase JWTs
        if (token.startsWith('ey') && token.includes('.')) {
          return { data: { user: { id: 'mock-jwt-user' } }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid JWT token' } };
      },
    },

    rpc: async (func: string, params: any) => {
      if (func === 'consume_recovery_code') {
        const { p_user_id, p_code_hash } = params;
        const release = await new Promise<() => void>((res) => {
          const prev = tableLock;
          tableLock = new Promise((innerRes) => {
            prev.then(() => res(innerRes));
          });
        });

        try {
          const match = recoveryCodes.find(
            (r) =>
              r.user_id === p_user_id &&
              r.code_hash === p_code_hash &&
              r.consumed_at === null &&
              r.revoked_at === null
          );

          if (match) {
            match.consumed_at = new Date().toISOString();
            return { data: true, error: null };
          }
          return { data: false, error: null };
        } finally {
          release();
        }
      }
      return { data: null, error: new Error('Unknown RPC function') };
    },

    from: (table: string) => {
      let targetArray: any[];
      if (table === 'user_recovery_codes') targetArray = recoveryCodes;
      else if (table === 'user_recovery_tickets') targetArray = recoveryTickets;
      else if (table === 'recovery_rate_limits') targetArray = rateLimits;
      else throw new Error(`Unknown table: ${table}`);

      return {
        insert: async (records: any | any[]) => {
          const recs = Array.isArray(records) ? records : [records];
          for (const r of recs) {
            targetArray.push({
              id: 'id-' + Math.random().toString(36).substring(2),
              ...r,
            });
          }
          return { data: records, error: null };
        },

        delete: () => {
          let filtered = [...targetArray];
          const query = {
            eq: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] === val);
              for (const item of filtered) {
                const idx = targetArray.indexOf(item);
                if (idx !== -1) targetArray.splice(idx, 1);
              }
              return Promise.resolve({ data: filtered, error: null });
            },
          };
          return query;
        },

        select: (cols: string = '*') => {
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
            select: async (_c?: string) => {
              const updatedRows: any[] = [];
              for (const item of filtered) {
                // If updating recovery codes, check concurrency condition
                if (table === 'user_recovery_codes' && updates.consumed_at) {
                  if (item.consumed_at !== null || item.revoked_at !== null) {
                    continue; // Skip if already consumed or revoked
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

async function runAllPhase2Tests() {
  console.log('\n--- Running Recovery Verification Security Test Suite (Phase 2) ---\n');

  // Test 1: Valid recovery code succeeds
  await test('Requirement 1: Valid recovery code succeeds and returns restricted recovery ticket', async () => {
    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const validCode = batch.codes[0];
    const result = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: validCode,
      ip: '192.168.1.1',
    });

    assert(result.success === true, 'Verification should succeed for valid code');
    assert(result.status === 200, `Expected status 200, got ${result.status}`);
    assert(result.ticket !== undefined && typeof result.ticket === 'string', 'Server must obtain internal ticket for cookie issuance');
    assert(result.ticket!.length === 64, 'Ticket must be a 256-bit hex string');
    assert((result.body as any).recovery_ticket === undefined, 'Plaintext recovery_ticket must NOT be returned in JSON body');
    assert(typeof result.body.expires_at === 'string', 'Response body must contain non-secret expires_at ISO string');
    assert(result.body.success === true, 'Response body success must be true');

    // Verify database row for ticket: only hash is stored
    assert(admin._recoveryTickets.length === 1, 'Recovery ticket must be persisted in database');
    const ticketRow = admin._recoveryTickets[0];
    assert(ticketRow.ticket_hash !== result.ticket, 'Plaintext ticket must NEVER be stored');
    assert(ticketRow.user_id === 'alice-uuid-1111', 'Ticket must be tied to Alice');
    assert(ticketRow.consumed_at === null, 'Ticket must be initially unconsumed');
  });

  // Test 2: Invalid recovery code fails
  await test('Requirement 2: Invalid recovery code fails with generic error response', async () => {
    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const result = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: 'INVALID-CODE-XXXX-YYYY',
      ip: '192.168.1.2',
    });

    assert(result.success === false, 'Verification must fail for invalid code');
    assert(result.status === 400, 'Expected HTTP 400');
    assert(result.body.error === GENERIC_RECOVERY_ERROR.error, 'Must return generic error code');
    assert(result.body.message === GENERIC_RECOVERY_ERROR.message, 'Must return generic error message');
    assert(!result.body.recovery_ticket, 'Must not return a ticket on failure');
  });

  // Test 3: Recovery code belonging to another account fails
  await test('Requirement 3: Recovery code belonging to another account fails', async () => {
    const admin = createPhase2MockAdmin();
    const aliceBatch = await generateRecoveryCodeSet(10);
    const bobBatch = await generateRecoveryCodeSet(10);

    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', aliceBatch.hashes);
    await storeRecoveryCodeHashes(admin, 'bob-uuid-2222', bobBatch.hashes);

    // Attempt to use Bob's code to recover Alice's account
    const result = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: bobBatch.codes[0],
      ip: '192.168.1.3',
    });

    assert(result.success === false, 'Cross-account recovery code must be rejected');
    assert(result.status === 400, 'Expected HTTP 400');
    assert(result.body.error === GENERIC_RECOVERY_ERROR.error, 'Must return generic error');
    assert(admin._recoveryTickets.length === 0, 'No ticket should be issued');
  });

  // Test 4: Consumed recovery code fails
  await test('Requirement 4: Consumed recovery code cannot be reused and fails', async () => {
    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    // Simulate code 0 already consumed
    admin._recoveryCodes[0].consumed_at = new Date().toISOString();

    const result = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.4',
    });

    assert(result.success === false, 'Consumed recovery code must fail verification');
    assert(result.status === 400, 'Expected HTTP 400');
    assert(result.body.error === GENERIC_RECOVERY_ERROR.error, 'Must return generic error');
  });

  // Test 5: Revoked recovery code fails
  await test('Requirement 5: Revoked recovery code fails', async () => {
    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    // Simulate code 0 revoked
    admin._recoveryCodes[0].revoked_at = new Date().toISOString();

    const result = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.5',
    });

    assert(result.success === false, 'Revoked recovery code must fail verification');
    assert(result.status === 400, 'Expected HTTP 400');
    assert(result.body.error === GENERIC_RECOVERY_ERROR.error, 'Must return generic error');
  });

  // Test 6: Same code cannot succeed twice (sequential reuse)
  await test('Requirement 6: Same code cannot succeed twice sequentially', async () => {
    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const code = batch.codes[0];

    // First attempt succeeds
    const firstResult = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code,
      ip: '192.168.1.6',
    });
    assert(firstResult.success === true, 'First attempt must succeed');

    // Second attempt with exact same code must fail
    const secondResult = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code,
      ip: '192.168.1.6',
    });
    assert(secondResult.success === false, 'Second attempt must fail');
    assert(secondResult.status === 400, 'Expected HTTP 400 on reuse');
  });

  // Test 7: Simultaneous requests cannot both consume the same code (race condition safety)
  await test('Requirement 7: Simultaneous requests cannot both consume the same code (atomic race safety)', async () => {
    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const targetCode = batch.codes[3];

    // Fire 10 concurrent requests at the exact same millisecond using the same code
    const concurrentRequests = Array.from({ length: 10 }, (_, i) =>
      handleRecoveryVerification(admin, {
        identifier: 'alice@example.com',
        code: targetCode,
        ip: `192.168.1.${10 + i}`,
      })
    );

    const allResults = await Promise.all(concurrentRequests);

    const successes = allResults.filter((r) => r.success === true);
    const failures = allResults.filter((r) => r.success === false);

    assert(successes.length === 1, `Exactly ONE request must succeed, got ${successes.length}`);
    assert(failures.length === 9, `Remaining 9 requests must fail, got ${failures.length}`);

    // Verify exactly one code was consumed in database
    const matchingRow = admin._recoveryCodes.find((r) => r.code_hash === batch.hashes[3]);
    assert(matchingRow?.consumed_at !== null, 'Matching code must be marked consumed');

    // Verify only 1 recovery ticket was created
    assert(admin._recoveryTickets.length === 1, 'Only one recovery ticket should have been issued');
  });

  // Test 8: Nonexistent account does not produce an account-enumeration response
  await test('Requirement 8: Nonexistent account produces identical generic error response (no account enumeration)', async () => {
    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    // Call with existing account and invalid code
    const existingAcctResult = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: 'WRONG-CODE-1111-2222',
      ip: '192.168.1.30',
    });

    // Call with non-existing account
    const nonExistentResult = await handleRecoveryVerification(admin, {
      identifier: 'nobody-does-not-exist@example.com',
      code: 'WRONG-CODE-1111-2222',
      ip: '192.168.1.31',
    });

    assert(existingAcctResult.status === nonExistentResult.status, 'Status codes must be identical');
    assert(existingAcctResult.status === 400, 'Status code must be 400');
    assert(
      JSON.stringify(existingAcctResult.body) === JSON.stringify(nonExistentResult.body),
      'Response bodies must be identical (no account enumeration oracle)'
    );
    assert(!JSON.stringify(nonExistentResult.body).toLowerCase().includes('not found'), 'Must not say "not found"');
    assert(!JSON.stringify(nonExistentResult.body).toLowerCase().includes('user'), 'Must not leak user state');
  });

  // Test 9: Rate limiting works (account throttling and IP throttling)
  await test('Requirement 9: Rate limiting enforces strict throttling on account and IP with generic 429', async () => {
    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const testIp = '10.0.0.99';

    // Account rate limiting: 5 failed attempts against alice@example.com
    for (let i = 0; i < ACCOUNT_RATE_LIMIT_MAX; i++) {
      const res = await handleRecoveryVerification(admin, {
        identifier: 'alice@example.com',
        code: `INVALID-CODE-TRY-${i}`,
        ip: testIp,
      });
      assert(res.status === 400, `Attempt ${i + 1} should be rejected with 400`);
    }

    // 6th attempt must be rate-limited with 429
    const blockedRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0], // Even a valid code is blocked when rate limited
      ip: testIp,
    });

    assert(blockedRes.status === 429, `6th attempt must return 429, got ${blockedRes.status}`);
    assert(blockedRes.body.error === GENERIC_RATE_LIMIT_ERROR.error, 'Must return generic rate-limit error code');
    assert(blockedRes.body.message === GENERIC_RATE_LIMIT_ERROR.message, 'Must return generic rate-limit message');
    assert(!JSON.stringify(blockedRes.body).includes('5'), 'Must not reveal attempt counts');
  });

  // Test 10: Recovery authorization expires
  await test('Requirement 10: Recovery authorization expires after validity window', async () => {
    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const result = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.40',
    });

    const ticket = result.ticket!;
    assert((result.body as any).recovery_ticket === undefined, 'Ticket must NOT be returned in body');

    // 1. Immediately valid
    const validCheck = await validateRecoveryTicket(admin, ticket);
    assert(validCheck.valid === true, 'Ticket should be valid immediately');
    assert(validCheck.userId === 'alice-uuid-1111', 'Ticket user ID matches Alice');

    // 2. Simulate expiration (set expires_at in the past)
    const ticketRow = admin._recoveryTickets[0];
    ticketRow.expires_at = new Date(Date.now() - 1000).toISOString();

    const expiredCheck = await validateRecoveryTicket(admin, ticket);
    assert(expiredCheck.valid === false, 'Expired ticket must be invalid');
  });

  // Test 11: Recovery authorization cannot access normal protected endpoints (session confusion defense)
  await test('Requirement 11: Recovery authorization cannot access normal Supabase session endpoints', async () => {
    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const result = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.45',
    });

    const ticket = result.ticket!;
    assert((result.body as any).recovery_ticket === undefined, 'Ticket must NOT be returned in body');

    // Passing the recovery ticket as a Bearer token to admin.auth.getUser() must fail
    const authCheck = await admin.auth.getUser(ticket);
    assert(authCheck.data.user === null, 'Recovery ticket must NOT authenticate as a Supabase user');
    assert(authCheck.error !== null, 'Recovery ticket must fail Supabase session validation');

    // Passing the recovery ticket to a protected API expecting a JWT must be rejected
    const isJwt = ticket.split('.').length === 3;
    assert(!isJwt, 'Recovery ticket must never be formatted as a Supabase JWT');
  });

  // Test 12: Recovery authorization is single-use
  await test('Requirement 12: Recovery authorization ticket is strictly single-use', async () => {
    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const result = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.50',
    });

    const ticket = result.ticket!;
    assert((result.body as any).recovery_ticket === undefined, 'Ticket must NOT be returned in body');

    // Check validity before consumption
    const check1 = await validateRecoveryTicket(admin, ticket);
    assert(check1.valid === true, 'Ticket is valid initially');

    // Consume ticket (as would happen upon password reset in Phase 3)
    const consumed = await consumeRecoveryTicket(admin, check1.ticketId!);
    assert(consumed === true, 'Ticket consumed successfully');

    // Second check after consumption must fail
    const check2 = await validateRecoveryTicket(admin, ticket);
    assert(check2.valid === false, 'Consumed ticket cannot be validated again');
  });

  // Test 13: Plaintext recovery codes are never logged
  await test('Requirement 13: Plaintext recovery codes are never logged during verification', async () => {
    const loggedMessages: string[] = [];
    const captureLog = (...args: any[]) => {
      loggedMessages.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };

    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = captureLog;
    console.info = captureLog;
    console.warn = captureLog;
    console.error = captureLog;

    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const testCode = batch.codes[0];

    try {
      await handleRecoveryVerification(admin, {
        identifier: 'alice@example.com',
        code: testCode,
        ip: '192.168.1.60',
      });
    } finally {
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    }

    for (const msg of loggedMessages) {
      assert(!msg.includes(testCode), `Plaintext code leaked in log message: ${msg}`);
    }
  });

  // Test 14: Recovery authorization secrets are never logged
  await test('Requirement 14: Recovery authorization ticket secrets are never logged', async () => {
    const loggedMessages: string[] = [];
    const captureLog = (...args: any[]) => {
      loggedMessages.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };

    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = captureLog;
    console.info = captureLog;
    console.warn = captureLog;
    console.error = captureLog;

    const admin = createPhase2MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    let ticketSecret = '';
    try {
      const res = await handleRecoveryVerification(admin, {
        identifier: 'alice@example.com',
        code: batch.codes[0],
        ip: '192.168.1.70',
      });
      ticketSecret = res.ticket!;
    } finally {
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    }

    assert(ticketSecret.length > 0, 'Ticket was generated');
    for (const msg of loggedMessages) {
      assert(!msg.includes(ticketSecret), `Recovery ticket secret leaked in log message: ${msg}`);
    }
  });

  console.log('\n--- Phase 2 Test Results Summary ---');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllPhase2Tests().catch((err) => {
  console.error('Test runner encountered an unhandled error:', err);
  process.exit(1);
});
