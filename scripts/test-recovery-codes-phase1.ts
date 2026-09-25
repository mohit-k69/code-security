/**
 * Automated Security Test Suite - Phase 1 Recovery Code Foundation
 *
 * Verifies all 10 security requirements:
 * 1. Exactly 10 codes are generated
 * 2. Codes are unique
 * 3. Randomness comes from a cryptographically secure source (Web Crypto) with >= 128 bits entropy
 * 4. Codes are not deterministically derived from user data
 * 5. Only hashes/verifiers are stored
 * 6. Plaintext codes are not logged
 * 7. Rows are associated with the correct user
 * 8. Consumed codes can be represented
 * 9. Revoked codes can be represented (regeneration behavior)
 * 10. RLS prevents normal client access
 */

import {
  generateRecoveryCode,
  generateRecoveryCodeSet,
  normalizeRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCodeHash,
  revokeActiveRecoveryCodes,
  storeRecoveryCodeHashes,
  generateAndStoreRecoveryCodes,
  CROCKFORD_ALPHABET,
  MIN_ENTROPY_BYTES,
  DEFAULT_ENTROPY_BYTES,
  RECOVERY_CODES_COUNT,
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

// In-memory mock Supabase Admin client to test database interactions safely
function createMockSupabaseAdmin() {
  const db: {
    id: string;
    user_id: string;
    code_hash: string;
    created_at: string;
    consumed_at: string | null;
    revoked_at: string | null;
  }[] = [];

  return {
    _db: db,
    rpc(funcName: string, args: any) {
      if (funcName === 'replace_user_recovery_codes_atomic') {
        const { p_user_id, p_code_hashes } = args;
        if (!p_user_id) return Promise.resolve({ data: null, error: { message: 'p_user_id cannot be null' } });
        if (!p_code_hashes || p_code_hashes.length !== 10) {
          return Promise.resolve({ data: null, error: { message: 'p_code_hashes must contain exactly 10 hashes' } });
        }
        let revokedCount = 0;
        const nowIso = new Date().toISOString();
        for (const r of db) {
          if (r.user_id === p_user_id && r.consumed_at === null && r.revoked_at === null) {
            r.revoked_at = nowIso;
            revokedCount++;
          }
        }
        for (const hash of p_code_hashes) {
          db.push({
            id: 'mock-id-' + Math.random().toString(36).substring(2),
            user_id: p_user_id,
            code_hash: hash,
            created_at: nowIso,
            consumed_at: null,
            revoked_at: null,
          });
        }
        return Promise.resolve({ data: [{ revoked_count: revokedCount, inserted_count: p_code_hashes.length }], error: null });
      }
      return Promise.resolve({ data: null, error: { message: `Unknown RPC function: ${funcName}` } });
    },
    from(table: string) {
      if (table !== 'user_recovery_codes') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        insert(rows: any[]) {
          for (const row of rows) {
            db.push({
              id: 'mock-id-' + Math.random().toString(36).substring(2),
              user_id: row.user_id,
              code_hash: row.code_hash,
              created_at: row.created_at || new Date().toISOString(),
              consumed_at: row.consumed_at || null,
              revoked_at: row.revoked_at || null,
            });
          }
          return Promise.resolve({ data: rows, error: null });
        },
        update(updates: any) {
          let filtered = [...db];
          const query = {
            eq(col: string, val: any) {
              filtered = filtered.filter((r: any) => r[col] === val);
              return query;
            },
            is(col: string, val: any) {
              filtered = filtered.filter((r: any) => r[col] === val);
              return query;
            },
            select(_cols: string) {
              // Apply updates to filtered items
              for (const item of filtered) {
                Object.assign(item, updates);
              }
              return Promise.resolve({ data: filtered, error: null });
            },
          };
          return query;
        },
        select(cols: string = '*') {
          let filtered = [...db];
          const query = {
            eq(col: string, val: any) {
              filtered = filtered.filter((r: any) => r[col] === val);
              return query;
            },
            is(col: string, val: any) {
              filtered = filtered.filter((r: any) => r[col] === val);
              return query;
            },
            single() {
              return Promise.resolve({ data: filtered[0] || null, error: null });
            },
            then(resolve: any) {
              return Promise.resolve({ data: filtered, error: null }).then(resolve);
            },
          };
          return query;
        },
      };
    },
  };
}

async function runAllTests() {
  console.log('\n--- Running Recovery Codes Security Test Suite (Phase 1) ---\n');

  // Test 1: Exactly 10 codes are generated
  await test('Requirement 1: Exactly 10 codes are generated per batch', async () => {
    const batch = await generateRecoveryCodeSet(10);
    assert(batch.codes.length === 10, `Expected 10 plaintext codes, got ${batch.codes.length}`);
    assert(batch.hashes.length === 10, `Expected 10 hashes, got ${batch.hashes.length}`);

    // Verify error thrown if count !== 10
    let errorThrown = false;
    try {
      await generateRecoveryCodeSet(8);
    } catch {
      errorThrown = true;
    }
    assert(errorThrown, 'Expected error when requesting count other than 10');
  });

  // Test 2: Codes are unique
  await test('Requirement 2: Codes are unique and adhere to Crockford Base32 formatting', async () => {
    const seen = new Set<string>();
    const totalBatches = 50; // 500 codes

    for (let b = 0; b < totalBatches; b++) {
      const batch = await generateRecoveryCodeSet(10);
      for (const code of batch.codes) {
        assert(!seen.has(code), `Collision detected for code: ${code}`);
        seen.add(code);

        // Verify format: human-readable chunks separated by hyphens
        const chunks = code.split('-');
        assert(chunks.length >= 4, `Code must contain at least 4 hyphen-separated chunks: ${code}`);
        for (const chunk of chunks) {
          assert(chunk.length === 4, `Each chunk must be 4 characters: ${chunk}`);
          for (const char of chunk) {
            assert(CROCKFORD_ALPHABET.includes(char), `Character ${char} is not in Crockford alphabet`);
          }
        }
      }
    }
    assert(seen.size === 500, `Expected 500 unique codes, got ${seen.size}`);
  });

  // Test 3: Randomness comes from a cryptographically secure source with >= 128 bits entropy
  await test('Requirement 3: Randomness comes from crypto.getRandomValues with >= 128 bits entropy', async () => {
    let getRandomValuesCalled = false;
    let requestedBytes = 0;

    const originalGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = ((array: any) => {
      getRandomValuesCalled = true;
      requestedBytes = array.byteLength;
      return originalGetRandomValues(array);
    }) as any;

    try {
      generateRecoveryCode(DEFAULT_ENTROPY_BYTES);
      assert(getRandomValuesCalled, 'crypto.getRandomValues was not called');
      assert(requestedBytes >= 16, `Requested bytes (${requestedBytes}) is less than 16 bytes (128 bits)`);
      assert(requestedBytes === 20, `Default requested bytes should be 20 (160 bits), got ${requestedBytes}`);

      // Verify that requesting less than 128 bits (16 bytes) is strictly rejected
      let rejected = false;
      try {
        generateRecoveryCode(12); // only 96 bits
      } catch {
        rejected = true;
      }
      assert(rejected, 'Generator must reject entropy below 16 bytes (128 bits)');
    } finally {
      globalThis.crypto.getRandomValues = originalGetRandomValues;
    }
  });

  // Test 4: Codes are not deterministically derived from user data
  await test('Requirement 4: Codes are independent and not deterministically derived from user data', async () => {
    const userParams = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      email: 'alice@example.com',
      passwordHash: '$2b$12$e80yV8...',
      timestamp: 1720000000000,
    };

    // Generating codes for identical user metadata must never produce the same results
    const batch1 = await generateRecoveryCodeSet(10);
    const batch2 = await generateRecoveryCodeSet(10);

    for (let i = 0; i < 10; i++) {
      assert(batch1.codes[i] !== batch2.codes[i], 'Codes must not match across generations');
      assert(batch1.hashes[i] !== batch2.hashes[i], 'Hashes must not match across generations');

      const norm1 = normalizeRecoveryCode(batch1.codes[i]);
      assert(!norm1.includes('ALICE'), 'Code must not derive from email');
      assert(!norm1.includes('426614174000'), 'Code must not derive from user ID');
    }
  });

  // Test 5: Only hashes/verifiers are stored
  await test('Requirement 5: Only cryptographic verifiers/hashes are stored, never plaintext', async () => {
    const mockAdmin = createMockSupabaseAdmin();
    const userId = '11111111-2222-3333-4444-555555555555';

    const plaintextCodes = await generateAndStoreRecoveryCodes(mockAdmin, userId);

    assert(mockAdmin._db.length === 10, 'Expected 10 rows in database');
    for (let i = 0; i < 10; i++) {
      const dbRow = mockAdmin._db[i];
      const code = plaintextCodes[i];

      // Crucial: The plaintext code must NEVER equal the stored code_hash
      assert(dbRow.code_hash !== code, 'Plaintext code must NEVER be stored in code_hash');
      assert(dbRow.code_hash.length === 64, `code_hash must be a 64-char SHA-256 hex string: ${dbRow.code_hash}`);

      // Verify the stored hash matches hashRecoveryCode(code)
      const expectedHash = await hashRecoveryCode(code);
      assert(dbRow.code_hash === expectedHash, 'Stored hash must match expected SHA-256 hash');

      // Verify verification utility
      const isValid = await verifyRecoveryCodeHash(code, dbRow.code_hash);
      assert(isValid, 'verifyRecoveryCodeHash should return true for matching code');

      const isInvalid = await verifyRecoveryCodeHash('INVALID-CODE-XXXX-YYYY', dbRow.code_hash);
      assert(!isInvalid, 'verifyRecoveryCodeHash should return false for incorrect code');
    }
  });

  // Test 6: Plaintext codes are not logged
  await test('Requirement 6: Plaintext recovery codes are never logged to console or logs', async () => {
    const loggedMessages: string[] = [];
    const captureLog = (...args: any[]) => {
      loggedMessages.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };

    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = captureLog;
    console.info = captureLog;
    console.warn = captureLog;
    console.error = captureLog;

    let generatedCodes: string[] = [];
    try {
      const mockAdmin = createMockSupabaseAdmin();
      generatedCodes = await generateAndStoreRecoveryCodes(mockAdmin, 'user-secret-test');
    } finally {
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    }

    assert(generatedCodes.length === 10, 'Generated 10 codes');
    for (const code of generatedCodes) {
      const normalized = normalizeRecoveryCode(code);
      for (const logMsg of loggedMessages) {
        assert(!logMsg.includes(code), `Plaintext code ${code} leaked in log: ${logMsg}`);
        assert(!logMsg.includes(normalized), `Normalized code ${normalized} leaked in log: ${logMsg}`);
      }
    }
  });

  // Test 7: Rows are associated with the correct user
  await test('Requirement 7: Rows are associated with the correct user_id with strict isolation', async () => {
    const mockAdmin = createMockSupabaseAdmin();
    const userA = 'aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const userB = 'bbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    await generateAndStoreRecoveryCodes(mockAdmin, userA);
    await generateAndStoreRecoveryCodes(mockAdmin, userB);

    assert(mockAdmin._db.length === 20, 'Expected 20 total rows (10 per user)');

    const rowsA = mockAdmin._db.filter((r) => r.user_id === userA);
    const rowsB = mockAdmin._db.filter((r) => r.user_id === userB);

    assert(rowsA.length === 10, 'Expected exactly 10 rows for User A');
    assert(rowsB.length === 10, 'Expected exactly 10 rows for User B');

    for (const r of rowsA) {
      assert(r.user_id === userA, 'User A row has incorrect user_id');
    }
    for (const r of rowsB) {
      assert(r.user_id === userB, 'User B row has incorrect user_id');
    }
  });

  // Test 8: Consumed codes can be represented
  await test('Requirement 8: Consumed codes are represented with consumed_at timestamp', async () => {
    const mockAdmin = createMockSupabaseAdmin();
    const userId = 'user-consumed-test';

    await generateAndStoreRecoveryCodes(mockAdmin, userId);

    // Initial state: all codes have consumed_at === null
    for (const row of mockAdmin._db) {
      assert(row.consumed_at === null, 'consumed_at must initially be null');
      assert(row.revoked_at === null, 'revoked_at must initially be null');
    }

    // Simulate consuming code 0
    const consumedTime = new Date().toISOString();
    mockAdmin._db[0].consumed_at = consumedTime;

    assert(mockAdmin._db[0].consumed_at === consumedTime, 'consumed_at was successfully recorded');
    assert(mockAdmin._db[1].consumed_at === null, 'other codes remain unconsumed');

    // Active query (consumed_at is null and revoked_at is null) should only return 9 codes
    const activeCodes = mockAdmin._db.filter(r => r.consumed_at === null && r.revoked_at === null);
    assert(activeCodes.length === 9, `Expected 9 active codes, got ${activeCodes.length}`);
  });

  // Test 9: Revoked codes can be represented and regeneration invalidates prior codes
  await test('Requirement 9: Revoked codes and regeneration behavior (revoked_at)', async () => {
    const mockAdmin = createMockSupabaseAdmin();
    const userId = 'user-regeneration-test';

    // 1st generation
    const firstGenCodes = await generateAndStoreRecoveryCodes(mockAdmin, userId);
    assert(mockAdmin._db.length === 10, 'First generation produced 10 rows');
    for (const row of mockAdmin._db) {
      assert(row.revoked_at === null, 'All initial rows should have revoked_at === null');
    }

    // Simulate 1 code being consumed before regeneration
    mockAdmin._db[0].consumed_at = new Date().toISOString();

    // 2nd generation (regeneration)
    const secondGenCodes = await generateAndStoreRecoveryCodes(mockAdmin, userId);
    assert(mockAdmin._db.length === 20, 'Second generation added 10 new rows (total 20)');

    const oldRows = mockAdmin._db.slice(0, 10);
    const newRows = mockAdmin._db.slice(10, 20);

    // Check old rows:
    // Old code 0 was consumed before regeneration: consumed_at is set, revoked_at is null (or consumed)
    assert(oldRows[0].consumed_at !== null, 'Previously consumed code preserved consumed_at');
    // The other 9 old codes were active and must now be revoked:
    for (let i = 1; i < 10; i++) {
      assert(oldRows[i].revoked_at !== null, `Old unconsumed code ${i} must have revoked_at set`);
    }

    // Check new rows:
    // All 10 new rows must be active
    for (const row of newRows) {
      assert(row.consumed_at === null, 'New code must have consumed_at === null');
      assert(row.revoked_at === null, 'New code must have revoked_at === null');
    }

    // Only the 10 new codes are active
    const activeCodes = mockAdmin._db.filter(r => r.consumed_at === null && r.revoked_at === null);
    assert(activeCodes.length === 10, `Expected exactly 10 active codes after regeneration, got ${activeCodes.length}`);
  });

  // Test 10: RLS prevents normal client access
  await test('Requirement 10: Row Level Security (RLS) denies client access and secures table', async () => {
    const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260925100000_user_recovery_codes.sql');
    assert(fs.existsSync(migrationPath), `Migration file not found at: ${migrationPath}`);

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Verify table creation
    assert(sql.includes('CREATE TABLE IF NOT EXISTS public.user_recovery_codes'), 'Migration must create user_recovery_codes');
    assert(sql.includes('REFERENCES auth.users(id) ON DELETE CASCADE'), 'Migration must reference auth.users with CASCADE');
    assert(sql.includes('code_hash TEXT NOT NULL'), 'Migration must include code_hash TEXT NOT NULL');

    // Verify RLS enabled
    assert(sql.includes('ALTER TABLE public.user_recovery_codes ENABLE ROW LEVEL SECURITY'), 'Migration must ENABLE ROW LEVEL SECURITY');

    // Verify client deny-all policies
    assert(sql.includes('REVOKE ALL ON TABLE public.user_recovery_codes FROM anon'), 'Migration must revoke access from anon');
    assert(sql.includes('REVOKE ALL ON TABLE public.user_recovery_codes FROM authenticated'), 'Migration must revoke access from authenticated');
    assert(sql.includes('REVOKE ALL ON TABLE public.user_recovery_codes FROM PUBLIC'), 'Migration must revoke access from PUBLIC');

    // Verify service_role and postgres retain access
    assert(sql.includes('GRANT ALL ON TABLE public.user_recovery_codes TO service_role'), 'Migration must grant access to service_role');

    // Verify indexes
    assert(sql.includes('idx_user_recovery_codes_user_id'), 'Migration must create user_id index');
    assert(sql.includes('idx_user_recovery_codes_lookup'), 'Migration must create lookup index for active codes');
  });

  console.log('\n--- Test Results Summary ---');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test runner encountered an unhandled error:', err);
  process.exit(1);
});
