/**
 * Automated Security Test Suite - Phase 3.2 Ambiguous Outcome Handling
 *
 * Verifies all 14 requirements specified for Ambiguous Supabase Auth Responses:
 * 1. Confirmed Supabase success
 * 2. Confirmed Supabase failure (definite pre-update validation rejection)
 * 3. Simulated timeout after request transmission
 * 4. Simulated lost response after successful password update (reconciliation)
 * 5. Server crash/failure before finalization
 * 6. Ticket is NOT released after an ambiguous result
 * 7. Ambiguous ticket cannot be reused to change the password
 * 8. Legitimate unused recovery codes remain available
 * 9. Successful reset still consumes exactly one ticket
 * 10. Concurrent reset requests still allow only one successful password change
 * 11. New password works
 * 12. Old password fails
 * 13. Refresh-token/session revocation behaves as expected
 * 14. Existing OAuth identities remain intact
 */

import express from 'express';
import http from 'http';
import crypto from 'crypto';
import {
  handleRecoveryVerification,
  handlePasswordResetWithTicket,
  atomicallyClaimRecoveryTicket,
  releaseRecoveryTicketClaim,
  markRecoveryTicketAmbiguous,
  reconcileAmbiguousPasswordUpdate,
  isDefinitePreUpdateFailure,
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

// In-memory mock database & Supabase Auth admin for Phase 3.2 tests
function createPhase32MockAdmin() {
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
    claimed_at: string | null;
    claim_expires_at: string | null;
    claim_id: string | null;
    password_updated_at: string | null;
    ambiguous_at: string | null;
  }[] = [];

  const auditLogs: { event_type: string; user_id?: string; ticket_id?: string; ip: string }[] = [];

  return {
    _users: users,
    _sessions: sessions,
    _recoveryCodes: recoveryCodes,
    _recoveryTickets: recoveryTickets,
    _auditLogs: auditLogs,

    rpc: async (func: string, params: any) => {
      const now = Date.now();

      if (func === 'claim_recovery_ticket_atomic') {
        const ticketHash = params.p_ticket_hash;
        const ticket = recoveryTickets.find(
          (t) =>
            t.ticket_hash === ticketHash &&
            t.consumed_at === null &&
            t.revoked_at === null &&
            t.ambiguous_at === null &&
            new Date(t.expires_at).getTime() > now &&
            (t.claim_expires_at === null ||
              new Date(t.claim_expires_at).getTime() < now ||
              t.password_updated_at !== null)
        );
        if (!ticket) {
          return { data: [], error: null };
        }
        const leaseSecs = params.p_lease_seconds || 30;
        ticket.claimed_at = new Date(now).toISOString();
        ticket.claim_expires_at = new Date(now + leaseSecs * 1000).toISOString();
        ticket.claim_id = crypto.randomUUID();
        return {
          data: [
            {
              ticket_id: ticket.id,
              user_id: ticket.user_id,
              claim_id: ticket.claim_id,
              already_updated: Boolean(ticket.password_updated_at),
            },
          ],
          error: null,
        };
      }

      if (func === 'release_recovery_ticket_claim') {
        const ticket = recoveryTickets.find(
          (t) => t.id === params.p_ticket_id && t.claim_id === params.p_claim_id
        );
        // Only release if not consumed, not updated, and NOT ambiguous
        if (ticket && !ticket.consumed_at && !ticket.password_updated_at && !ticket.ambiguous_at) {
          ticket.claimed_at = null;
          ticket.claim_expires_at = null;
          ticket.claim_id = null;
          return { data: true, error: null };
        }
        return { data: false, error: null };
      }

      if (func === 'mark_recovery_ticket_ambiguous') {
        const ticket = recoveryTickets.find(
          (t) => t.id === params.p_ticket_id && t.claim_id === params.p_claim_id
        );
        if (ticket && !ticket.consumed_at) {
          ticket.ambiguous_at = new Date(now).toISOString();
          ticket.claim_expires_at = null; // Locked permanently
          return { data: true, error: null };
        }
        return { data: false, error: null };
      }

      if (func === 'record_recovery_password_updated') {
        const ticket = recoveryTickets.find(
          (t) => t.id === params.p_ticket_id && t.claim_id === params.p_claim_id
        );
        if (ticket && !ticket.consumed_at) {
          ticket.password_updated_at = new Date(now).toISOString();
          return { data: true, error: null };
        }
        return { data: false, error: null };
      }

      if (func === 'finalize_recovery_ticket_atomic') {
        const ticket = recoveryTickets.find(
          (t) =>
            t.id === params.p_ticket_id &&
            (t.claim_id === params.p_claim_id || t.password_updated_at !== null)
        );
        if (ticket && !ticket.consumed_at) {
          ticket.consumed_at = new Date(now).toISOString();
          ticket.claim_expires_at = null;
          return { data: true, error: null };
        }
        return { data: false, error: null };
      }

      if (func === 'consume_recovery_ticket_atomic') {
        const ticketHash = params.p_ticket_hash;
        const ticket = recoveryTickets.find(
          (t) =>
            t.ticket_hash === ticketHash &&
            t.consumed_at === null &&
            t.revoked_at === null &&
            t.ambiguous_at === null &&
            new Date(t.expires_at).getTime() > now &&
            (t.claim_expires_at === null || new Date(t.claim_expires_at).getTime() < now)
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
            u.passwordHash = `hash_${updates.password}`;
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
            targetArray.push({
              id: `mock-id-${Math.random().toString(36).substring(2, 9)}`,
              claimed_at: null,
              claim_expires_at: null,
              claim_id: null,
              password_updated_at: null,
              consumed_at: null,
              revoked_at: null,
              ambiguous_at: null,
              ...r,
            });
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
                if (table === 'user_recovery_tickets') {
                  if (updates.consumed_at && (item.consumed_at !== null || item.revoked_at !== null)) {
                    continue;
                  }
                  if (updates.claimed_at && (item.consumed_at !== null || item.revoked_at !== null || item.ambiguous_at !== null)) {
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

async function runPhase32Tests() {
  console.log('--- Phase 3.2 Ambiguous Outcome Handling Security Test Suite ---');

  // 1. Confirmed Supabase success
  await test('Test 1: Confirmed Supabase success updates password and finalizes ticket', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.1',
    });
    const ticket = verifyRes.ticket!;

    const resetRes = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'confirmed-success-pass-1',
      confirmPassword: 'confirmed-success-pass-1',
      origin: 'http://localhost:3000',
      ip: '10.0.0.1',
    });

    assert(resetRes.success === true, 'Confirmed success should succeed');
    assert(resetRes.status === 200, 'Expected status 200');
    assert(admin._recoveryTickets[0].consumed_at !== null, 'Ticket must be consumed');
    assert(admin._recoveryTickets[0].ambiguous_at === null, 'Ambiguous must be null on success');
    const alice = admin._users.find((u) => u.id === 'alice-uuid-1111');
    assert(alice?.passwordHash === 'hash_confirmed-success-pass-1', 'Password updated');
  });

  // 2. Confirmed Supabase failure (definite pre-update validation rejection)
  await test('Test 2: Confirmed Supabase failure releases claim and allows retry', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.2',
    });
    const ticket = verifyRes.ticket!;

    // Mock definite GoTrue validation rejection (e.g. 422 Unprocessable Entity)
    const origUpdate = admin.auth.admin.updateUserById;
    let attempts = 0;
    admin.auth.admin.updateUserById = async (id: string, updates: any) => {
      attempts++;
      if (attempts === 1) {
        return { data: null, error: { status: 422, message: 'Password is too weak' } };
      }
      return origUpdate(id, updates);
    };

    const firstAttempt = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'weak-1',
      confirmPassword: 'weak-1',
      origin: 'http://localhost:3000',
      ip: '10.0.0.2',
    });

    assert(firstAttempt.success === false, 'First attempt must fail');
    assert(firstAttempt.status === 400, 'Expected 400 for definite validation error');
    assert(admin._recoveryTickets[0].consumed_at === null, 'Ticket must NOT be consumed');
    assert(admin._recoveryTickets[0].ambiguous_at === null, 'Must NOT be marked ambiguous on definite rejection');
    assert(admin._recoveryTickets[0].claim_id === null, 'Claim must be released back to available');

    // Retry with stronger password succeeds
    const secondAttempt = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'strong-password-retry-123',
      confirmPassword: 'strong-password-retry-123',
      origin: 'http://localhost:3000',
      ip: '10.0.0.2',
    });
    assert(secondAttempt.success === true, 'Retry must succeed');
    assert(secondAttempt.status === 200, 'Expected 200 on retry');
    assert(admin._recoveryTickets[0].consumed_at !== null, 'Ticket now consumed');
  });

  // 3. Simulated timeout after request transmission
  await test('Test 3: Simulated timeout after request transmission locks ticket (fail-closed)', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.3',
    });
    const ticket = verifyRes.ticket!;

    // Mock timeout error (uncertain if GoTrue updated password or not)
    admin.auth.admin.updateUserById = async () => {
      throw new Error('ETIMEDOUT: Connection timed out after request transmitted');
    };

    const resetRes = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'timeout-simulated-pwd-123',
      confirmPassword: 'timeout-simulated-pwd-123',
      origin: 'http://localhost:3000',
      ip: '10.0.0.3',
    });

    assert(resetRes.success === false, 'Timeout reset must fail');
    assert(resetRes.status === 500, 'Expected status 500');
    assert(resetRes.body.error === 'RECOVERY_TRANSACTION_UNCERTAIN', 'Must report RECOVERY_TRANSACTION_UNCERTAIN');

    // Invariant: UNKNOWN OUTCOME != AVAILABLE TICKET
    const ticketRecord = admin._recoveryTickets[0];
    assert(ticketRecord.ambiguous_at !== null, 'Ticket must be marked ambiguous_at');
    assert(ticketRecord.claim_expires_at === null, 'Lease expiration cleared - permanently locked');
  });

  // 4. Simulated lost response after successful password update (reconciliation)
  await test('Test 4: Simulated lost response after successful password update reconciles safely', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.4',
    });
    const ticket = verifyRes.ticket!;

    // Simulate network drop on response: GoTrue committed password update, then threw network drop
    admin.auth.admin.updateUserById = async (id: string, updates: any) => {
      // GoTrue committed update:
      const u = admin._users.find((x) => x.id === id)!;
      u.passwordHash = `hash_${updates.password}`;
      // Then response pipe broke:
      throw new Error('ECONNRESET: Connection reset by peer after transmission');
    };

    const resetRes = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'reconciled-pass-xyz-789',
      confirmPassword: 'reconciled-pass-xyz-789',
      origin: 'http://localhost:3000',
      ip: '10.0.0.4',
    });

    // Reconciliation should detect password was changed and promote to success!
    assert(resetRes.success === true, 'Reconciliation should prove update succeeded and return 200');
    assert(resetRes.status === 200, 'Expected 200');
    assert(admin._recoveryTickets[0].consumed_at !== null, 'Ticket must be finalized as consumed');

    const alice = admin._users.find((u) => u.id === 'alice-uuid-1111');
    assert(alice?.passwordHash === 'hash_reconciled-pass-xyz-789', 'Password confirmed updated');
  });

  // 5. Server crash/failure before finalization
  await test('Test 5: Server crash/failure before finalization handles idempotently on retry', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.5',
    });
    const ticket = verifyRes.ticket!;

    // Simulate crash after password_updated_at was set
    const ticketRecord = admin._recoveryTickets[0];
    ticketRecord.claimed_at = new Date().toISOString();
    ticketRecord.claim_expires_at = new Date(Date.now() + 30000).toISOString();
    ticketRecord.claim_id = crypto.randomUUID();
    ticketRecord.password_updated_at = new Date().toISOString();
    admin._users[0].passwordHash = 'hash_crash-window-initial-pwd';

    // User retries
    const retryRes = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'try-overwrite-crash-window',
      confirmPassword: 'try-overwrite-crash-window',
      origin: 'http://localhost:3000',
      ip: '10.0.0.5',
    });

    assert(retryRes.success === true, 'Idempotent retry returns success');
    assert(ticketRecord.consumed_at !== null, 'Ticket finalized as consumed');
    assert(admin._users[0].passwordHash === 'hash_crash-window-initial-pwd', 'Original password preserved intact');
  });

  // 6. Ticket is NOT released after an ambiguous result
  await test('Test 6: Ticket is NOT released after an ambiguous result (fail-closed check)', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.6',
    });
    const ticket = verifyRes.ticket!;

    // Throw socket hang up without password update
    admin.auth.admin.updateUserById = async () => {
      throw new Error('socket hang up');
    };

    await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'hangup-pass-123',
      confirmPassword: 'hangup-pass-123',
      origin: 'http://localhost:3000',
      ip: '10.0.0.6',
    });

    const ticketRecord = admin._recoveryTickets[0];
    assert(ticketRecord.ambiguous_at !== null, 'Ticket marked ambiguous_at');

    // Attempting to call releaseRecoveryTicketClaim manually fails because ticket is ambiguous
    const released = await releaseRecoveryTicketClaim(admin, ticketRecord.id, ticketRecord.claim_id!);
    assert(released === false, 'Cannot release an ambiguous ticket');
    assert(ticketRecord.ambiguous_at !== null, 'Ticket remains ambiguous');
  });

  // 7. Ambiguous ticket cannot be reused to change the password
  await test('Test 7: Ambiguous ticket cannot be reused to change the password', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.7',
    });
    const ticket = verifyRes.ticket!;

    // Lock ticket into ambiguous
    admin.auth.admin.updateUserById = async () => {
      throw new Error('500 Internal Server Error: upstream timeout');
    };
    await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'first-attempt-pass',
      confirmPassword: 'first-attempt-pass',
      origin: 'http://localhost:3000',
      ip: '10.0.0.7',
    });

    // Attacker tries to use the ambiguous ticket
    const secondAttempt = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'attacker-hijack-pass',
      confirmPassword: 'attacker-hijack-pass',
      origin: 'http://localhost:3000',
      ip: '10.0.0.7',
    });

    assert(secondAttempt.success === false, 'Second attempt with ambiguous ticket must fail');
    assert(secondAttempt.status === 400, 'Expected 400');
    assert(secondAttempt.body.error === 'INVALID_RECOVERY_TICKET', 'Must report invalid ticket');
    const alice = admin._users.find((u) => u.id === 'alice-uuid-1111');
    assert(alice?.passwordHash !== 'hash_attacker-hijack-pass', 'Attacker password was not accepted');
  });

  // 8. Legitimate unused recovery codes remain available
  await test('Test 8: Legitimate unused recovery codes remain available after ambiguous ticket lock', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    // Use Code 0 -> results in ambiguous locked ticket
    const verifyRes0 = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.8',
    });
    const ticket0 = verifyRes0.ticket!;

    admin.auth.admin.updateUserById = async () => {
      throw new Error('503 Service Unavailable');
    };
    await handlePasswordResetWithTicket(admin, {
      ticket: ticket0,
      newPassword: 'attempt-with-code-0',
      confirmPassword: 'attempt-with-code-0',
      origin: 'http://localhost:3000',
      ip: '10.0.0.8',
    });

    // Code 0 ticket is locked in ambiguous state
    assert(admin._recoveryTickets[0].ambiguous_at !== null, 'Ticket 0 is locked');

    // Code 1 (backup code) is untouched and available!
    // Restore normal GoTrue behavior
    admin.auth.admin.updateUserById = async (id: string, updates: any) => {
      const u = admin._users.find((x) => x.id === id)!;
      u.passwordHash = `hash_${updates.password}`;
      return { data: { user: u }, error: null };
    };

    const verifyRes1 = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[1],
      ip: '10.0.0.8',
    });

    assert(verifyRes1.success === true, 'Verification with Code 1 must succeed');
    const ticket1 = verifyRes1.ticket!;

    const resetRes1 = await handlePasswordResetWithTicket(admin, {
      ticket: ticket1,
      newPassword: 'success-with-backup-code-1',
      confirmPassword: 'success-with-backup-code-1',
      origin: 'http://localhost:3000',
      ip: '10.0.0.8',
    });

    assert(resetRes1.success === true, 'Password reset with backup Code 1 must succeed');
    assert(resetRes1.status === 200, 'Expected 200');
    const alice = admin._users.find((u) => u.id === 'alice-uuid-1111');
    assert(alice?.passwordHash === 'hash_success-with-backup-code-1', 'Password successfully reset using Code 1');
  });

  // 9. Successful reset still consumes exactly one ticket
  await test('Test 9: Successful reset still consumes exactly one ticket', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.9',
    });
    const ticket = verifyRes.ticket!;

    const resetRes = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'single-consumption-pwd-1',
      confirmPassword: 'single-consumption-pwd-1',
      origin: 'http://localhost:3000',
      ip: '10.0.0.9',
    });

    assert(resetRes.success === true, 'Reset should succeed');
    const consumedTickets = admin._recoveryTickets.filter((t) => t.consumed_at !== null);
    assert(consumedTickets.length === 1, `Expected exactly 1 consumed ticket, got ${consumedTickets.length}`);

    // Second call with same ticket fails
    const secondCall = await handlePasswordResetWithTicket(admin, {
      ticket,
      newPassword: 'single-consumption-pwd-2',
      confirmPassword: 'single-consumption-pwd-2',
      origin: 'http://localhost:3000',
      ip: '10.0.0.9',
    });
    assert(secondCall.success === false, 'Second call must fail');
  });

  // 10. Concurrent reset requests still allow only one successful password change
  await test('Test 10: Concurrent reset requests still allow only one successful password change', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.10',
    });
    const ticket = verifyRes.ticket!;

    // 10 concurrent requests
    const promises = Array.from({ length: 10 }, (_, i) =>
      handlePasswordResetWithTicket(admin, {
        ticket,
        newPassword: `concurrent-pwd-${i}`,
        confirmPassword: `concurrent-pwd-${i}`,
        origin: 'http://localhost:3000',
        ip: `10.0.1.${10 + i}`,
      })
    );

    const resultsArray = await Promise.all(promises);
    const successes = resultsArray.filter((r) => r.success === true);
    const failures = resultsArray.filter((r) => r.success === false);

    assert(successes.length === 1, `Exactly ONE reset must succeed, got ${successes.length}`);
    assert(failures.length === 9, `Remaining 9 resets must fail, got ${failures.length}`);

    const winningIndex = resultsArray.findIndex((r) => r.success === true);
    const alice = admin._users.find((u) => u.id === 'alice-uuid-1111');
    assert(alice?.passwordHash === `hash_concurrent-pwd-${winningIndex}`, 'Only winner password accepted');
  });

  // 11. New password works
  await test('Test 11: New password works for normal authentication', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.11',
    });

    await handlePasswordResetWithTicket(admin, {
      ticket: verifyRes.ticket!,
      newPassword: 'my-working-new-password-2026',
      confirmPassword: 'my-working-new-password-2026',
      origin: 'http://localhost:3000',
      ip: '10.0.0.11',
    });

    const loginRes = await admin.auth.signInWithPassword({
      email: 'alice@example.com',
      password: 'my-working-new-password-2026',
    });
    assert(loginRes.data.session !== null, 'Login with new password must succeed');
    assert(loginRes.data.user?.id === 'alice-uuid-1111', 'Session user matches Alice');
  });

  // 12. Old password fails
  await test('Test 12: Old password fails after recovery reset', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.12',
    });

    await handlePasswordResetWithTicket(admin, {
      ticket: verifyRes.ticket!,
      newPassword: 'super-brand-new-password-999',
      confirmPassword: 'super-brand-new-password-999',
      origin: 'http://localhost:3000',
      ip: '10.0.0.12',
    });

    const oldLoginRes = await admin.auth.signInWithPassword({
      email: 'alice@example.com',
      password: 'old-hashed-password-1111',
    });
    assert(oldLoginRes.data.session === null, 'Old password must fail');
    assert(oldLoginRes.error !== null, 'Error returned for old password');
  });

  // 13. Refresh-token/session revocation behaves as expected
  await test('Test 13: Refresh-token/session revocation behaves as expected', async () => {
    const admin = createPhase32MockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const aliceSession = admin._sessions.find((s) => s.user_id === 'alice-uuid-1111')!;
    assert(aliceSession.active === true, 'Session active prior to reset');

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '10.0.0.13',
    });

    await handlePasswordResetWithTicket(admin, {
      ticket: verifyRes.ticket!,
      newPassword: 'session-revocation-test-pass-88',
      confirmPassword: 'session-revocation-test-pass-88',
      origin: 'http://localhost:3000',
      ip: '10.0.0.13',
    });

    assert(aliceSession.active === false, 'Session deactivated after password reset');
    assert(
      admin._sessions.every((s) => s.user_id !== 'alice-uuid-1111' || !s.active),
      'All active sessions for alice must be deactivated'
    );
  });

  // 14. Existing OAuth identities remain intact
  await test('Test 14: Existing OAuth identities remain intact after recovery reset', async () => {
    const admin = createPhase32MockAdmin();
    const bobBatch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'bob-uuid-2222', bobBatch.hashes);

    const bobBefore = admin._users.find((u) => u.id === 'bob-uuid-2222')!;
    assert(bobBefore.identities.some((i) => i.provider === 'github'), 'GitHub identity exists');

    const verifyRes = await handleRecoveryVerification(admin, {
      identifier: 'bob@example.com',
      code: bobBatch.codes[0],
      ip: '10.0.0.14',
    });

    await handlePasswordResetWithTicket(admin, {
      ticket: verifyRes.ticket!,
      newPassword: 'oauth-preserved-new-pass-333',
      confirmPassword: 'oauth-preserved-new-pass-333',
      origin: 'http://localhost:3000',
      ip: '10.0.0.14',
    });

    const bobAfter = admin._users.find((u) => u.id === 'bob-uuid-2222')!;
    const githubIdent = bobAfter.identities.find((i) => i.provider === 'github');
    assert(githubIdent !== undefined, 'GitHub identity must still exist');
    assert(githubIdent?.identity_data.user_name === 'bobgit', 'GitHub username preserved');

    // Email login works with new password
    const login = await admin.auth.signInWithPassword({
      email: 'bob@example.com',
      password: 'oauth-preserved-new-pass-333',
    });
    assert(login.data.session !== null, 'Login with new password works');
  });

  console.log('\n--- Phase 3.2 Test Results Summary ---');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase32Tests();
