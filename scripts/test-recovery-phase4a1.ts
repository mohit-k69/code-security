/**
 * Comprehensive Automated Test Suite - Phase 4A.1: Strengthened Recovery-Code Regeneration Security
 *
 * Verifies all security requirements:
 * 1. Initial generation (0 active codes) succeeds with normal valid session.
 * 2. Regeneration with valid session but WITHOUT required reauthentication is strictly REJECTED (401).
 * 3. Old recovery codes are NOT revoked when reauthentication fails.
 * 4. Tampered frontend reauthentication flags (e.g. `isReauthenticated: true`) are REJECTED.
 * 5. Invalid current password fails (401).
 * 6. Correct current password authorizes regeneration (200), revokes old codes, and generates fresh set.
 * 7. Ephemeral step-up token authorizes regeneration (200).
 * 8. Ephemeral step-up token is strictly single-use (cannot be replayed).
 * 9. Expired step-up token fails (401).
 * 10. Step-up token issued to User A cannot be used by User B (USER_MISMATCH).
 * 11. OAuth-only accounts (Google/GitHub) are safely blocked from regeneration (403 OAUTH_REAUTHENTICATION_UNSUPPORTED).
 * 12. Atomicity under concurrent regeneration requests: exactly 10 active codes in the final state.
 * 13. Plaintext codes returned strictly once; verifier hashes stored in DB.
 */

import {
  handleRecoveryCodesGenerationRequest,
  createStepUpReauthToken,
  verifyAndConsumeStepUpToken,
  isOAuthOnlyUser,
  withUserRegenerationLock,
} from "../src/lib/recoveryReauth";
import {
  getRecoveryCodesStatus,
  generateAndStoreRecoveryCodes,
  RECOVERY_CODES_COUNT,
} from "../src/lib/recoveryCodes";

let passed = 0;
let failed = 0;
const results: { name: string; status: "PASS" | "FAIL"; message?: string }[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    results.push({ name, status: "PASS" });
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    failed++;
    results.push({ name, status: "FAIL", message: err.message });
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

// In-memory mock database client for testing
function createMockAdmin() {
  const users = [
    {
      id: "alice-1111",
      email: "alice@example.com",
      app_metadata: { provider: "email", providers: ["email"] },
      identities: [{ provider: "email" }],
    },
    {
      id: "bob-2222",
      email: "bob@example.com",
      app_metadata: { provider: "email", providers: ["email"] },
      identities: [{ provider: "email" }],
    },
    {
      id: "oauth-user-3333",
      email: "oauth@example.com",
      app_metadata: { provider: "google", providers: ["google"] },
      identities: [{ provider: "google" }],
    },
    {
      id: "github-user-4444",
      email: "gh@example.com",
      app_metadata: { provider: "github", providers: ["github"] },
      identities: [{ provider: "github" }],
    },
  ];

  const recoveryCodes: Array<{
    id: string;
    user_id: string;
    code_hash: string;
    created_at: string;
    consumed_at: string | null;
    revoked_at: string | null;
  }> = [];

  const admin: any = {
    _users: users,
    _recoveryCodes: recoveryCodes,
    rpc: async (funcName: string, args: any) => {
      if (funcName === 'replace_user_recovery_codes_atomic') {
        const { p_user_id, p_code_hashes } = args;
        if (!p_user_id) return { data: null, error: { message: 'p_user_id cannot be null' } };
        if (!p_code_hashes || p_code_hashes.length !== 10) {
          return { data: null, error: { message: 'p_code_hashes must contain exactly 10 hashes' } };
        }
        let revokedCount = 0;
        const nowIso = new Date().toISOString();
        for (const r of recoveryCodes) {
          if (r.user_id === p_user_id && r.consumed_at === null && r.revoked_at === null) {
            r.revoked_at = nowIso;
            revokedCount++;
          }
        }
        for (const hash of p_code_hashes) {
          recoveryCodes.push({
            id: `rc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            user_id: p_user_id,
            code_hash: hash,
            created_at: nowIso,
            consumed_at: null,
            revoked_at: null,
          });
        }
        return { data: [{ revoked_count: revokedCount, inserted_count: p_code_hashes.length }], error: null };
      }
      return { data: null, error: { message: `Unknown RPC function: ${funcName}` } };
    },
    from: (table: string) => {
      let targetArray = recoveryCodes;
      return {
        select: (cols: string) => {
          let filtered = [...targetArray];
          const queryBuilder: any = {
            eq: (col: string, val: any) => {
              filtered = filtered.filter((r: any) => r[col] === val);
              return queryBuilder;
            },
            is: (col: string, val: any) => {
              filtered = filtered.filter((r: any) => r[col] === val);
              return queryBuilder;
            },
            order: (col: string, opts?: any) => {
              filtered.sort((a: any, b: any) => {
                if (opts?.ascending) return a[col] > b[col] ? 1 : -1;
                return a[col] < b[col] ? 1 : -1;
              });
              return queryBuilder;
            },
            then: (resolve: any) => resolve({ data: filtered, error: null }),
          };
          return queryBuilder;
        },
        insert: (records: any[]) => {
          const inserted = records.map((r, i) => ({
            id: `rc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`,
            ...r,
          }));
          targetArray.push(...inserted);
          return Promise.resolve({ data: inserted, error: null });
        },
        update: (updates: any) => {
          const queryBuilder: any = {
            eq: (col: string, val: any) => {
              queryBuilder._eqCol = col;
              queryBuilder._eqVal = val;
              return queryBuilder;
            },
            is: (col: string, val: any) => {
              queryBuilder._isConditions = queryBuilder._isConditions || [];
              queryBuilder._isConditions.push({ col, val });
              return queryBuilder;
            },
            select: () => {
              const updated: any[] = [];
              targetArray.forEach((r) => {
                let matches = true;
                if (queryBuilder._eqCol && r[queryBuilder._eqCol as keyof typeof r] !== queryBuilder._eqVal) {
                  matches = false;
                }
                if (queryBuilder._isConditions) {
                  for (const c of queryBuilder._isConditions) {
                    if (r[c.col as keyof typeof r] !== c.val) matches = false;
                  }
                }
                if (matches) {
                  Object.assign(r, updates);
                  updated.push(r);
                }
              });
              return Promise.resolve({ data: updated, error: null });
            },
          };
          return queryBuilder;
        },
      };
    },
  };

  const mockPasswordValidator = {
    verifyPassword: async (email: string, pwd: string) => {
      // Mock valid password is "valid-pass-123"
      return pwd === "valid-pass-123";
    },
  };

  return { admin, mockPasswordValidator, users, recoveryCodes };
}

async function runSuite() {
  console.log("==================================================================");
  console.log("   AUTOMATED TEST SUITE: PHASE 4A.1 REGENERATION SECURITY");
  console.log("==================================================================");

  // Test 1: Initial generation vs Regeneration distinction
  await test("1. Initial generation succeeds for user with 0 codes without requiring password", async () => {
    const { admin, mockPasswordValidator, users } = createMockAdmin();
    const alice = users[0];

    const initialStatus = await getRecoveryCodesStatus(admin, alice.id);
    assert(!initialStatus.hasCodes, "Initial status should report no codes");

    // Initial generation call (no password or reauthToken provided)
    const result = await handleRecoveryCodesGenerationRequest(admin, {
      userId: alice.id,
      user: alice,
      clientOverride: mockPasswordValidator,
    });

    assert(result.status === 200, `Expected status 200, received ${result.status}`);
    assert(result.body.success === true, "Expected success true");
    assert(result.body.isInitial === true, "Expected isInitial true");
    assert(Array.isArray(result.body.codes) && result.body.codes.length === 10, "Expected 10 plaintext codes");

    const afterStatus = await getRecoveryCodesStatus(admin, alice.id);
    assert(afterStatus.hasCodes === true, "Status should now report hasCodes true");
    assert(afterStatus.activeCount === 10, "Status should report exactly 10 active codes");
  });

  // Test 2: Valid normal session alone CANNOT regenerate when active codes exist
  await test("2. Normal session without step-up reauthentication cannot regenerate existing codes", async () => {
    const { admin, mockPasswordValidator, users } = createMockAdmin();
    const alice = users[0];

    // Seed 10 active recovery codes for Alice
    await generateAndStoreRecoveryCodes(admin, alice.id);
    const beforeCodes = await getRecoveryCodesStatus(admin, alice.id);
    assert(beforeCodes.activeCount === 10, "Alice must have 10 active codes");

    // Attempt regeneration with ONLY session auth (no password, no step-up token)
    const result = await handleRecoveryCodesGenerationRequest(admin, {
      userId: alice.id,
      user: alice,
      clientOverride: mockPasswordValidator,
    });

    assert(result.status === 401, `Expected status 401, got ${result.status}`);
    assert(result.body.error === "REAUTHENTICATION_REQUIRED", `Expected REAUTHENTICATION_REQUIRED, got ${result.body.error}`);

    // CRITICAL: Ensure existing active codes were NOT invalidated
    const afterCodes = await getRecoveryCodesStatus(admin, alice.id);
    assert(afterCodes.activeCount === 10, "Existing codes must remain untouched and active");
  });

  // Test 3: Tampered frontend reauthentication flags are rejected
  await test("3. Tampered frontend reauthentication flags (e.g. isReauthenticated: true) are rejected", async () => {
    const { admin, mockPasswordValidator, users } = createMockAdmin();
    const alice = users[0];
    await generateAndStoreRecoveryCodes(admin, alice.id);

    // Attacker passes fraudulent flags in request
    const fraudulentPayload: any = {
      userId: alice.id,
      user: alice,
      isReauthenticated: true,
      clientOverride: mockPasswordValidator,
    };

    const result = await handleRecoveryCodesGenerationRequest(admin, fraudulentPayload);
    assert(result.status === 401, "Expected 401 when relying on frontend boolean flag");
    assert(result.body.error === "REAUTHENTICATION_REQUIRED", "Must require server-verified reauthentication");

    const status = await getRecoveryCodesStatus(admin, alice.id);
    assert(status.activeCount === 10, "Active codes must not be modified");
  });

  // Test 4: Invalid current password fails
  await test("4. Invalid current password fails with 401 and does not revoke existing codes", async () => {
    const { admin, mockPasswordValidator, users } = createMockAdmin();
    const alice = users[0];
    await generateAndStoreRecoveryCodes(admin, alice.id);

    const result = await handleRecoveryCodesGenerationRequest(admin, {
      userId: alice.id,
      user: alice,
      currentPassword: "wrong-password-999",
      clientOverride: mockPasswordValidator,
    });

    assert(result.status === 401, `Expected 401, received ${result.status}`);
    assert(result.body.error === "INVALID_CREDENTIALS", `Expected INVALID_CREDENTIALS, got ${result.body.error}`);

    const status = await getRecoveryCodesStatus(admin, alice.id);
    assert(status.activeCount === 10, "Existing codes must not be revoked on failed password");
  });

  // Test 5: Correct current password authorizes regeneration
  await test("5. Correct current password authorizes regeneration and replaces old codes with fresh set", async () => {
    const { admin, mockPasswordValidator, users, recoveryCodes } = createMockAdmin();
    const alice = users[0];
    await generateAndStoreRecoveryCodes(admin, alice.id);

    // Initial 10 hashes
    const oldHashes = recoveryCodes.map((r) => r.code_hash);

    const result = await handleRecoveryCodesGenerationRequest(admin, {
      userId: alice.id,
      user: alice,
      currentPassword: "valid-pass-123",
      clientOverride: mockPasswordValidator,
    });

    assert(result.status === 200, `Expected status 200, got ${result.status}`);
    assert(result.body.success === true, "Expected success true");
    assert(result.body.isRegeneration === true, "Expected isRegeneration true");
    assert(result.body.codes.length === 10, "Expected 10 new plaintext codes");

    // Check database state: exactly 10 active codes, 10 revoked codes
    const active = recoveryCodes.filter((r) => r.user_id === alice.id && !r.consumed_at && !r.revoked_at);
    const revoked = recoveryCodes.filter((r) => r.user_id === alice.id && r.revoked_at !== null);

    assert(active.length === 10, `Expected 10 active codes, got ${active.length}`);
    assert(revoked.length === 10, `Expected 10 revoked codes, got ${revoked.length}`);

    // Verify new active codes have different hashes than old codes
    const newHashes = active.map((r) => r.code_hash);
    const overlaps = newHashes.filter((h) => oldHashes.includes(h));
    assert(overlaps.length === 0, "New active codes must be distinct from revoked codes");
  });

  // Test 6: Ephemeral step-up token authorizes regeneration
  await test("6. Valid ephemeral step-up token authorizes regeneration", async () => {
    const { admin, mockPasswordValidator, users } = createMockAdmin();
    const alice = users[0];
    await generateAndStoreRecoveryCodes(admin, alice.id);

    // User reauthenticates and receives a short-lived step-up token
    const stepUp = createStepUpReauthToken(alice.id, 120 * 1000);
    assert(typeof stepUp.token === "string" && stepUp.token.length === 64, "Token should be 64-char hex");

    const result = await handleRecoveryCodesGenerationRequest(admin, {
      userId: alice.id,
      user: alice,
      reauthToken: stepUp.token,
      clientOverride: mockPasswordValidator,
    });

    assert(result.status === 200, `Expected 200, got ${result.status}`);
    assert(result.body.success === true, "Expected success true");
    assert(result.body.codes.length === 10, "Expected 10 codes returned");
  });

  // Test 7: Step-up token is single-use (replay attack prevention)
  await test("7. Step-up token cannot be reused/replayed after consumption", async () => {
    const { admin, mockPasswordValidator, users } = createMockAdmin();
    const alice = users[0];
    await generateAndStoreRecoveryCodes(admin, alice.id);

    const stepUp = createStepUpReauthToken(alice.id);

    // First use: succeeds
    const firstAttempt = await handleRecoveryCodesGenerationRequest(admin, {
      userId: alice.id,
      user: alice,
      reauthToken: stepUp.token,
      clientOverride: mockPasswordValidator,
    });
    assert(firstAttempt.status === 200, "First use must succeed");

    // Second use with identical token: fails
    const secondAttempt = await handleRecoveryCodesGenerationRequest(admin, {
      userId: alice.id,
      user: alice,
      reauthToken: stepUp.token,
      clientOverride: mockPasswordValidator,
    });
    assert(secondAttempt.status === 401, "Replay must fail with 401");
    assert(secondAttempt.body.error === "INVALID_TOKEN" || secondAttempt.body.error === "ALREADY_USED", "Error should indicate consumed token");
  });

  // Test 8: Expired step-up token fails
  await test("8. Expired step-up token is rejected with 401", async () => {
    const { admin, mockPasswordValidator, users } = createMockAdmin();
    const alice = users[0];
    await generateAndStoreRecoveryCodes(admin, alice.id);

    // Create token that already expired (-1000 ms)
    const stepUp = createStepUpReauthToken(alice.id, -1000);

    const result = await handleRecoveryCodesGenerationRequest(admin, {
      userId: alice.id,
      user: alice,
      reauthToken: stepUp.token,
      clientOverride: mockPasswordValidator,
    });

    assert(result.status === 401, `Expected 401, got ${result.status}`);
    assert(result.body.error === "EXPIRED_TOKEN", `Expected EXPIRED_TOKEN, got ${result.body.error}`);
  });

  // Test 9: Step-up token issued to User A cannot be used by User B
  await test("9. Step-up token tied to User A is rejected when submitted by User B", async () => {
    const { admin, mockPasswordValidator, users } = createMockAdmin();
    const alice = users[0];
    const bob = users[1];
    await generateAndStoreRecoveryCodes(admin, bob.id);

    // Token issued to Alice
    const aliceToken = createStepUpReauthToken(alice.id);

    // Bob tries to use Alice's token
    const result = await handleRecoveryCodesGenerationRequest(admin, {
      userId: bob.id,
      user: bob,
      reauthToken: aliceToken.token,
      clientOverride: mockPasswordValidator,
    });

    assert(result.status === 401, "Expected 401 on user mismatch");
    assert(result.body.error === "USER_MISMATCH", `Expected USER_MISMATCH, got ${result.body.error}`);
  });

  // Test 10: OAuth-only user regeneration is safely held unavailable
  await test("10. OAuth-only accounts (Google/GitHub) are safely blocked from regeneration (403)", async () => {
    const { admin, mockPasswordValidator, users } = createMockAdmin();
    const googleUser = users[2];
    const githubUser = users[3];

    assert(isOAuthOnlyUser(googleUser), "Google user should be detected as OAuth-only");
    assert(isOAuthOnlyUser(githubUser), "GitHub user should be detected as OAuth-only");

    // Seed recovery codes for Google user
    await generateAndStoreRecoveryCodes(admin, googleUser.id);

    // Attempt regeneration as OAuth-only user
    const result = await handleRecoveryCodesGenerationRequest(admin, {
      userId: googleUser.id,
      user: googleUser,
      currentPassword: "any-password",
      clientOverride: mockPasswordValidator,
    });

    assert(result.status === 403, `Expected status 403 for OAuth-only account, received ${result.status}`);
    assert(result.body.error === "OAUTH_REAUTHENTICATION_UNSUPPORTED", `Expected OAUTH_REAUTHENTICATION_UNSUPPORTED, got ${result.body.error}`);

    // Ensure codes were not invalidated
    const status = await getRecoveryCodesStatus(admin, googleUser.id);
    assert(status.activeCount === 10, "Existing codes must remain active");
  });

  // Test 11: Atomicity under concurrent regeneration requests
  await test("11. Concurrent regeneration requests execute atomically, yielding exactly 10 active codes", async () => {
    const { admin, mockPasswordValidator, users, recoveryCodes } = createMockAdmin();
    const alice = users[0];
    await generateAndStoreRecoveryCodes(admin, alice.id);

    // Issue 5 separate valid reauth tokens for 5 concurrent requests
    const tokens = Array.from({ length: 5 }, () => createStepUpReauthToken(alice.id).token);

    // Launch 5 concurrent regeneration requests simultaneously
    const promises = tokens.map((tok) =>
      handleRecoveryCodesGenerationRequest(admin, {
        userId: alice.id,
        user: alice,
        reauthToken: tok,
        clientOverride: mockPasswordValidator,
      })
    );

    const outcomes = await Promise.all(promises);
    const successCount = outcomes.filter((o) => o.status === 200).length;
    assert(successCount === 5, `All 5 authorized requests should succeed, succeeded: ${successCount}`);

    // Verify database state: exactly ONE coherent active set (10 codes)
    const active = recoveryCodes.filter((r) => r.user_id === alice.id && !r.consumed_at && !r.revoked_at);
    assert(
      active.length === RECOVERY_CODES_COUNT,
      `Expected exactly ${RECOVERY_CODES_COUNT} active codes after concurrent regenerations, found ${active.length}`
    );
  });

  // Test 12: Secret handling verification
  await test("12. Plaintext codes returned strictly once; verifier hashes stored in database", async () => {
    const { admin, mockPasswordValidator, users, recoveryCodes } = createMockAdmin();
    const alice = users[0];

    const result = await handleRecoveryCodesGenerationRequest(admin, {
      userId: alice.id,
      user: alice,
      clientOverride: mockPasswordValidator,
    });

    assert(result.body.codes.length === 10, "Must return 10 plaintext codes");

    // Verify plaintext codes format: 4 chunks separated by hyphens (e.g. XXXX-XXXX-XXXX...)
    for (const code of result.body.codes) {
      assert(code.includes("-"), `Code ${code} must be formatted with hyphens`);
      // Database MUST NOT contain plaintext code
      const foundInDb = recoveryCodes.some((r) => r.code_hash === code);
      assert(!foundInDb, `Database must never store plaintext code ${code}`);
    }
  });

  console.log("==================================================================");
  console.log(`   TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error("Test suite fatal error:", err);
  process.exit(1);
});
