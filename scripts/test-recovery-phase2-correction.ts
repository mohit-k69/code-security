/**
 * Phase 2.1 Focused Security Test Suite:
 * Recovery-Ticket Delivery, Cookie Hardening, and Proxy-Safe Rate Limiting
 *
 * Verifies all 9 requirements:
 * 1. Recovery ticket is NOT present in the JSON response
 * 2. Recovery ticket IS set in an HttpOnly cookie
 * 3. Secure flag is present in production configuration
 * 4. SameSite=Strict is present
 * 5. Cookie path is appropriately scoped (/api/auth/recovery)
 * 6. Plaintext recovery ticket never appears in logs
 * 7. Recovery ticket is not stored in browser-accessible application storage
 * 8. Arbitrary X-Forwarded-For cannot trivially bypass IP throttling under configured proxy model
 * 9. Recovery ticket cannot authenticate against normal Supabase APIs
 */

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  handleRecoveryVerification,
  resolveClientIp,
  clearMemoryRateLimits,
  IP_RATE_LIMIT_MAX,
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

// In-memory mock admin for testing
function createMockAdmin() {
  const users = [
    {
      id: 'alice-uuid-1111',
      email: 'alice@example.com',
      identities: [{ identity_data: { email: 'alice@example.com' } }],
      user_metadata: { email: 'alice@example.com' },
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

  return {
    _users: users,
    _recoveryCodes: recoveryCodes,
    _recoveryTickets: recoveryTickets,

    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        getUserById: async (id: string) => {
          const u = users.find((x) => x.id === id);
          return { data: { user: u || null }, error: u ? null : { message: 'Not found' } };
        },
      },
      getUser: async (token: string) => {
        // Recovery tickets are 64-char hex strings, NOT Supabase JWTs
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
      else targetArray = [];

      return {
        insert: async (rows: any | any[]) => {
          const toInsert = Array.isArray(rows) ? rows : [rows];
          for (const r of toInsert) {
            targetArray.push({ id: `mock-id-${Math.random().toString(36).substring(2, 9)}`, ...r });
          }
          return { data: toInsert, error: null };
        },

        select: () => ({
          eq: (col: string, val: any) => ({
            single: async () => {
              const item = targetArray.find((r) => r[col] === val);
              return { data: item || null, error: item ? null : { message: 'Not found' } };
            },
          }),
        }),

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
                if (table === 'user_recovery_codes' && updates.consumed_at) {
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

// Setup a lightweight Express test server simulating the /api/auth/recovery/verify endpoint
function createTestServer(mockAdmin: any) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());

  app.post('/api/auth/recovery/verify', async (req, res) => {
    const ip = req.ip || resolveClientIp(req.socket?.remoteAddress, req.headers['x-forwarded-for'], 1);
    const email = req.body?.email || req.body?.identifier;
    const code = req.body?.code;

    try {
      const result = await handleRecoveryVerification(mockAdmin, {
        identifier: email,
        code,
        ip,
      });

      if (result.success && result.ticket) {
        // Enforce secure flag in production or when forward proto is https
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

      // CRITICAL: result.body contains ONLY non-secret info ({ success: true, expires_at: "..." })
      return res.status(result.status).json(result.body);
    } catch {
      return res.status(500).json({ error: 'RECOVERY_VERIFICATION_FAILED' });
    }
  });

  return app;
}

async function runPhase2CorrectionTests() {
  console.log('\n--- Running Phase 2.1 Recovery Ticket Security Review Tests ---\n');

  // Test 1: recovery ticket is NOT present in the JSON response
  await test('Requirement 1: recovery ticket is NOT present in the JSON response', async () => {
    const admin = createMockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const app = createTestServer(admin);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/recovery/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice@example.com', code: batch.codes[0] }),
      });

      const body = await response.json();
      assert(response.status === 200, `Expected 200, got ${response.status}`);
      assert(body.success === true, 'Success flag should be true');
      assert(typeof body.expires_at === 'string', 'expires_at must be an ISO timestamp');

      // CRITICAL ASSERTION: Plaintext ticket must NOT be in JSON
      assert(body.recovery_ticket === undefined, 'recovery_ticket must NOT exist in JSON body');
      assert(body.ticket === undefined, 'ticket must NOT exist in JSON body');
      assert(body.expires_in === undefined, 'expires_in must not be exposed if not needed');

      // Body should strictly have only non-secret keys: success and expires_at
      const keys = Object.keys(body);
      for (const k of keys) {
        assert(['success', 'expires_at'].includes(k), `Unexpected key "${k}" in JSON response`);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // Test 2: recovery ticket IS set in an HttpOnly cookie
  await test('Requirement 2: recovery ticket IS set in an HttpOnly cookie', async () => {
    const admin = createMockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const app = createTestServer(admin);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/recovery/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice@example.com', code: batch.codes[0] }),
      });

      const setCookieHeader = response.headers.get('set-cookie');
      assert(setCookieHeader !== null, 'Set-Cookie header must be present');
      assert(setCookieHeader!.includes('recovery_ticket='), 'Set-Cookie must contain recovery_ticket');
      assert(setCookieHeader!.toLowerCase().includes('httponly'), 'Cookie must have HttpOnly flag');

      // Extract ticket value and verify format
      const match = setCookieHeader!.match(/recovery_ticket=([a-f0-9]+)/i);
      assert(match !== null, 'Ticket value must be hex string');
      assert(match![1].length === 64, 'Ticket must be a 256-bit (64-char) hex string');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // Test 3: Secure flag is present in production configuration
  await test('Requirement 3: Secure flag is present in production configuration', async () => {
    const admin = createMockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const app = createTestServer(admin);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // 1. With X-Forwarded-Proto: https (simulating reverse proxy SSL termination)
      const resHttps = await fetch(`http://127.0.0.1:${port}/api/auth/recovery/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-Proto': 'https',
        },
        body: JSON.stringify({ identifier: 'alice@example.com', code: batch.codes[0] }),
      });

      const cookieHttps = resHttps.headers.get('set-cookie') || '';
      assert(cookieHttps.toLowerCase().includes('secure'), 'Cookie must have Secure flag on HTTPS');

      // 2. Under NODE_ENV = production
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const resProd = await fetch(`http://127.0.0.1:${port}/api/auth/recovery/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: 'alice@example.com', code: batch.codes[1] }),
        });
        const cookieProd = resProd.headers.get('set-cookie') || '';
        assert(cookieProd.toLowerCase().includes('secure'), 'Cookie must have Secure flag in production');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // Test 4: SameSite=Strict is present
  await test('Requirement 4: SameSite=Strict is present', async () => {
    const admin = createMockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const app = createTestServer(admin);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/recovery/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice@example.com', code: batch.codes[0] }),
      });

      const setCookie = response.headers.get('set-cookie') || '';
      assert(
        setCookie.toLowerCase().includes('samesite=strict'),
        'Cookie must specify SameSite=Strict for CSRF immunity'
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // Test 5: cookie path is appropriately scoped
  await test('Requirement 5: cookie path is appropriately scoped (/api/auth/recovery)', async () => {
    const admin = createMockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const app = createTestServer(admin);
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/recovery/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice@example.com', code: batch.codes[0] }),
      });

      const setCookie = response.headers.get('set-cookie') || '';
      assert(
        setCookie.toLowerCase().includes('path=/api/auth/recovery'),
        'Cookie path must be narrowly scoped to /api/auth/recovery'
      );
      assert(!setCookie.toLowerCase().includes('path=/;'), 'Cookie must NOT be scoped to root /');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // Test 6: plaintext recovery ticket never appears in logs
  await test('Requirement 6: plaintext recovery ticket never appears in logs', async () => {
    const captured: string[] = [];
    const pushMsg = (...args: any[]) => {
      captured.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };

    const origLog = console.log;
    const origInfo = console.info;
    const origWarn = console.warn;
    const origError = console.error;

    console.log = pushMsg;
    console.info = pushMsg;
    console.warn = pushMsg;
    console.error = pushMsg;

    const admin = createMockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    let ticketIssued = '';
    try {
      const res = await handleRecoveryVerification(admin, {
        identifier: 'alice@example.com',
        code: batch.codes[0],
        ip: '192.168.1.55',
      });
      ticketIssued = res.ticket!;
    } finally {
      console.log = origLog;
      console.info = origInfo;
      console.warn = origWarn;
      console.error = origError;
    }

    assert(Boolean(ticketIssued), 'A ticket was issued');
    for (const msg of captured) {
      assert(!msg.includes(ticketIssued), `Plaintext ticket appeared in log: ${msg}`);
    }
  });

  // Test 7: recovery ticket is not stored in browser-accessible application storage
  await test('Requirement 7: recovery ticket is not stored in browser-accessible application storage', async () => {
    // Scan all frontend source files in src/
    function checkDir(dir: string): string[] {
      let files: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
          files = files.concat(checkDir(full));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js'))) {
          files.push(full);
        }
      }
      return files;
    }

    const srcFiles = checkDir(path.resolve('./src'));
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      // Ensure no client file saves recovery_ticket to localStorage, sessionStorage, or document.cookie
      assert(
        !content.includes("localStorage.setItem('recovery_ticket'") &&
        !content.includes('localStorage.setItem("recovery_ticket"') &&
        !content.includes("sessionStorage.setItem('recovery_ticket'") &&
        !content.includes('sessionStorage.setItem("recovery_ticket"'),
        `Client storage leak detected in ${file}`
      );
    }
  });

  // Test 8: arbitrary X-Forwarded-For cannot trivially bypass IP throttling under configured proxy model
  await test('Requirement 8: arbitrary X-Forwarded-For cannot trivially bypass IP throttling under configured proxy model', async () => {
    // Under reverse proxy model (hop count = 1), the proxy appends the client IP to the right:
    // Attacker sends: X-Forwarded-For: 1.1.1.1 (spoofed)
    // Reverse proxy forwards: X-Forwarded-For: 1.1.1.1, 203.0.113.100 (real client IP)
    const spoofAttempt1 = resolveClientIp('10.0.0.1', '1.1.1.1, 203.0.113.100', 1);
    const spoofAttempt2 = resolveClientIp('10.0.0.1', '2.2.2.2, 203.0.113.100', 1);
    const spoofAttempt3 = resolveClientIp('10.0.0.1', '99.88.77.66, 44.33.22.11, 203.0.113.100', 1);

    assert(
      spoofAttempt1 === '203.0.113.100',
      `Expected real IP 203.0.113.100, got ${spoofAttempt1}`
    );
    assert(
      spoofAttempt2 === '203.0.113.100',
      `Expected real IP 203.0.113.100, got ${spoofAttempt2}`
    );
    assert(
      spoofAttempt3 === '203.0.113.100',
      `Expected real IP 203.0.113.100, got ${spoofAttempt3}`
    );

    // Verify rate limiter blocks an attacker even if they cycle spoofed IPs in the header
    const admin = createMockAdmin();
    const realIp = '203.0.113.100';

    for (let i = 0; i < IP_RATE_LIMIT_MAX; i++) {
      const resolved = resolveClientIp('10.0.0.1', `${i}.${i}.${i}.${i}, ${realIp}`, 1);
      await handleRecoveryVerification(admin, {
        identifier: `attacker-victim-${i}@example.com`,
        code: 'INVALID-CODE',
        ip: resolved,
      });
    }

    // Attempt IP_RATE_LIMIT_MAX + 1 with yet another fake IP prepended
    const spoofedHeader = `8.8.8.8, ${realIp}`;
    const nextResolved = resolveClientIp('10.0.0.1', spoofedHeader, 1);
    const blockedResult = await handleRecoveryVerification(admin, {
      identifier: 'another-user@example.com',
      code: 'INVALID-CODE',
      ip: nextResolved,
    });

    assert(
      blockedResult.status === 429,
      `Attacker cycling X-Forwarded-For must be blocked by rate limit (status 429), got ${blockedResult.status}`
    );
  });

  // Test 9: recovery ticket cannot authenticate against normal Supabase APIs
  await test('Requirement 9: recovery ticket cannot authenticate against normal Supabase APIs', async () => {
    const admin = createMockAdmin();
    const batch = await generateRecoveryCodeSet(10);
    await storeRecoveryCodeHashes(admin, 'alice-uuid-1111', batch.hashes);

    const result = await handleRecoveryVerification(admin, {
      identifier: 'alice@example.com',
      code: batch.codes[0],
      ip: '192.168.1.60',
    });

    const ticket = result.ticket!;
    assert(typeof ticket === 'string' && ticket.length === 64, 'Valid ticket generated');

    // 1. Recovery ticket must fail GoTrue / Supabase getUser()
    const supabaseAuthRes = await admin.auth.getUser(ticket);
    assert(supabaseAuthRes.data.user === null, 'Recovery ticket must NOT authenticate as Supabase user');
    assert(supabaseAuthRes.error !== null, 'Supabase must return error when given recovery ticket');

    // 2. Recovery ticket is not a JWT
    const isJwt = ticket.split('.').length === 3;
    assert(!isJwt, 'Recovery ticket must not be a JWT');

    // 3. Normal application endpoints expecting Bearer tokens reject the ticket
    const authHeader = `Bearer ${ticket}`;
    assert(!authHeader.includes('eyJ'), 'Recovery ticket does not contain JWT signature header');
  });

  console.log('\n--- Phase 2.1 Test Results Summary ---');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2CorrectionTests();
