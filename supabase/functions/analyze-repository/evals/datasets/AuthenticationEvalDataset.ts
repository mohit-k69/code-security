import type { EvalDataset } from "../types.ts";

export const AuthenticationEvalDataset: EvalDataset = {
  checkpointId: "SEC-AUTH-001",
  version: "2.0",
  scenarios: [
    // ═══════════════════════════════════════════════════════════════════
    // AUTH-C1: Password Storage & Hashing
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTH-FAIL-01",
      description: "Detects plaintext password storage during registration",
      tags: ["plaintext", "password-storage"],
      criteriaTargeted: ["AUTH-C1"],
      changedFiles: [
        {
          path: "src/controllers/auth.ts",
          content: `
export async function register(req, res) {
  const { username, password } = req.body;
  // Saving directly without hashing
  await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, password]);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C1",
          expectedEvidence: [{ file: "src/controllers/auth.ts", snippetSubstr: "VALUES (?, ?)'" }]
        }
      ],
      rationale: "Password is saved in plaintext, violating C1."
    },
    {
      id: "AUTH-FAIL-02",
      description: "Detects plaintext password comparison during login",
      tags: ["plaintext", "password-storage", "login"],
      criteriaTargeted: ["AUTH-C1"],
      changedFiles: [
        {
          path: "src/controllers/auth.ts",
          content: `
export async function login(req, res) {
  const { username, password } = req.body;
  const user = await db.query('SELECT * FROM users WHERE username = ?', [username]);
  if (user && user.password === password) {
    req.session.user = user;
    return res.json({ token: generateToken(user) });
  }
  return res.status(401).send();
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C1",
          expectedEvidence: [{ file: "src/controllers/auth.ts", snippetSubstr: "user.password === password" }]
        }
      ],
      rationale: "Password is compared in plaintext, violating C1."
    },
    {
      id: "AUTH-FAIL-03",
      description: "Detects MD5 hashing for passwords",
      tags: ["md5", "password-storage"],
      criteriaTargeted: ["AUTH-C1"],
      changedFiles: [
        {
          path: "src/controllers/auth.ts",
          content: `
import crypto from 'crypto';

export async function register(req, res) {
  const { username, password } = req.body;
  const hash = crypto.createHash('md5').update(password).digest('hex');
  await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C1",
          expectedEvidence: [{ file: "src/controllers/auth.ts", snippetSubstr: "createHash('md5')" }]
        }
      ],
      rationale: "MD5 is explicitly rejected for password storage in C1."
    },
    {
      id: "AUTH-FAIL-04",
      description: "Detects SHA-256 hashing without salt for passwords",
      tags: ["sha256", "password-storage", "no-salt"],
      criteriaTargeted: ["AUTH-C1"],
      changedFiles: [
        {
          path: "src/controllers/auth.ts",
          content: `
import crypto from 'crypto';

export async function register(req, res) {
  const { username, password } = req.body;
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C1",
          expectedEvidence: [{ file: "src/controllers/auth.ts", snippetSubstr: "createHash('sha256')" }]
        }
      ],
      rationale: "SHA-family without adaptive hashing violates C1."
    },
    {
      id: "AUTH-PASS-01",
      description: "Secure password hashing using bcrypt",
      tags: ["bcrypt", "password-storage", "secure"],
      criteriaTargeted: ["AUTH-C1"],
      changedFiles: [
        {
          path: "src/controllers/auth.ts",
          content: `
import bcrypt from 'bcrypt';

export async function register(req, res) {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 12);
  await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "bcrypt with sufficient work factor satisfies C1."
    },
    {
      id: "AUTH-NV-01",
      description: "Missing context for password verification",
      tags: ["missing-context", "password-storage"],
      criteriaTargeted: ["AUTH-C1"],
      changedFiles: [
        {
          path: "src/controllers/auth.ts",
          content: `
import { verifyCredentials } from '../lib/authService';

export async function login(req, res) {
  const { username, password } = req.body;
  const isValid = await verifyCredentials(username, password);
  if (isValid) {
    return res.json({ success: true });
  }
  return res.status(401).send();
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "The actual verification logic is in a file not provided in context."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTH-C2: Credential Handling & Transmission
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTH-FAIL-05",
      description: "Detects password logging during error handling",
      tags: ["logging", "transmission", "credentials"],
      criteriaTargeted: ["AUTH-C2"],
      changedFiles: [
        {
          path: "src/controllers/auth.ts",
          content: `
export async function login(req, res) {
  try {
    const { username, password } = req.body;
    await processLogin(username, password);
    res.json({ success: true });
  } catch (err) {
    console.error("Login failed for user:", req.body.username, "pwd:", req.body.password, err);
    res.status(500).send();
  }
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C2",
          expectedEvidence: [{ file: "src/controllers/auth.ts", snippetSubstr: "pwd:\", req.body.password" }]
        }
      ],
      rationale: "Passwords must never appear in application logs (C2)."
    },
    {
      id: "AUTH-FAIL-06",
      description: "Detects GET request with password in query params",
      tags: ["get-method", "transmission", "credentials"],
      criteriaTargeted: ["AUTH-C2"],
      changedFiles: [
        {
          path: "src/routes.ts",
          content: `
import express from 'express';
const router = express.Router();

router.get('/login', (req, res) => {
  const user = req.query.username;
  const pass = req.query.password;
  // process login
  res.json({ success: true });
});
export default router;
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C2",
          expectedEvidence: [{ file: "src/routes.ts", snippetSubstr: "req.query.password" }]
        }
      ],
      rationale: "Passwords must not appear in URLs or query params (C2)."
    },
    {
      id: "AUTH-FAIL-21",
      description: "JWT sent in query parameters",
      tags: ["jwt", "transmission", "token-security"],
      criteriaTargeted: ["AUTH-C2"],
      changedFiles: [
        {
          path: "src/redirect.ts",
          content: `
export function redirectUser(res, token) {
  // Transmitting token in URL
  res.redirect('/dashboard?token=' + token);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C2",
          expectedEvidence: [{ file: "src/redirect.ts", snippetSubstr: "?token=" }]
        }
      ],
      rationale: "Tokens should not be transmitted in URL parameters due to logging."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTH-C3: Login Flow Security
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTH-FAIL-23",
      description: "Client-side only authentication check",
      tags: ["login-flow", "client-side", "bypass"],
      criteriaTargeted: ["AUTH-C3"],
      changedFiles: [
        {
          path: "src/pages/Login.tsx",
          content: `
import { users } from '../data/users';

export function LoginPage() {
  const handleLogin = (username: string, password: string) => {
    const user = users.find(u => u.username === username && u.password === password);
    if (user) {
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userId', user.id);
      window.location.href = '/dashboard';
    } else {
      alert('Invalid credentials');
    }
  };
  return <LoginForm onSubmit={handleLogin} />;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C3",
          expectedEvidence: [{ file: "src/pages/Login.tsx", snippetSubstr: "users.find(u => u.username === username && u.password === password)" }]
        }
      ],
      rationale: "Authentication decisions must be made server-side; client-side credential comparison is trivially bypassable."
    },
    {
      id: "AUTH-FAIL-24",
      description: "OAuth flow missing state parameter validation",
      tags: ["login-flow", "oauth", "csrf"],
      criteriaTargeted: ["AUTH-C3"],
      changedFiles: [
        {
          path: "src/auth/callback.ts",
          content: `
export async function oauthCallback(req, res) {
  const { code } = req.query;
  // Missing: state parameter validation for CSRF protection
  const tokenResponse = await fetch('https://oauth-provider.com/token', {
    method: 'POST',
    body: JSON.stringify({ code, client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET }),
    headers: { 'Content-Type': 'application/json' }
  });
  const tokens = await tokenResponse.json();
  req.session.accessToken = tokens.access_token;
  res.redirect('/dashboard');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C3",
          expectedEvidence: [{ file: "src/auth/callback.ts", snippetSubstr: "const { code } = req.query" }]
        }
      ],
      rationale: "OAuth callbacks must validate the state parameter to prevent CSRF attacks."
    },
    {
      id: "AUTH-PASS-08",
      description: "Server-side login with proper input validation",
      tags: ["login-flow", "secure", "validation"],
      criteriaTargeted: ["AUTH-C3"],
      changedFiles: [
        {
          path: "src/controllers/auth.ts",
          content: `
import bcrypt from 'bcrypt';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const { email, password } = parsed.data;
  const user = await db.getUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).send();
    req.session.userId = user.id;
    res.json({ success: true });
  });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Server-side authentication with Zod validation, bcrypt comparison, and session regeneration."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTH-C4: Authentication Bypass Risks
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTH-FAIL-11",
      description: "Hardcoded debug backdoor bypassing authentication",
      tags: ["backdoor", "bypass"],
      criteriaTargeted: ["AUTH-C4"],
      changedFiles: [
        {
          path: "src/middleware.ts",
          content: `
export function requireAuth(req, res, next) {
  if (req.headers['x-debug-bypass'] === 'true') {
    req.user = { role: 'admin' };
    return next();
  }
  if (!req.session.userId) return res.status(401).send();
  next();
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C4",
          expectedEvidence: [{ file: "src/middleware.ts", snippetSubstr: "x-debug-bypass" }]
        }
      ],
      rationale: "Debug backdoors allow complete bypass of authentication checks."
    },
    {
      id: "AUTH-FAIL-12",
      description: "Logic flaw in password check (null evaluation allows bypass)",
      tags: ["logic-flaw", "bypass"],
      criteriaTargeted: ["AUTH-C4"],
      changedFiles: [
        {
          path: "src/auth.ts",
          content: `
export async function login(req, res) {
  const { username, password } = req.body;
  const user = await db.getUser(username);
  
  // Logic flaw: allows login if password is not provided
  if (!password || await bcrypt.compare(password, user.hash)) {
    req.session.userId = user.id;
    return res.json({ success: true });
  }
  res.status(401).send();
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C4",
          expectedEvidence: [{ file: "src/auth.ts", snippetSubstr: "if (!password ||" }]
        }
      ],
      rationale: "Logic flaw allows bypass if no password is submitted."
    },
    {
      id: "AUTH-FAIL-25",
      description: "Unprotected admin route missing auth middleware",
      tags: ["bypass", "missing-middleware"],
      criteriaTargeted: ["AUTH-C4"],
      changedFiles: [
        {
          path: "src/routes/admin.ts",
          content: `
import express from 'express';
import { requireAuth } from '../middleware';

const router = express.Router();

// Protected route
router.get('/admin/users', requireAuth, (req, res) => {
  res.json(db.getAllUsers());
});

// Missing requireAuth middleware!
router.delete('/admin/users/:id', (req, res) => {
  db.deleteUser(req.params.id);
  res.json({ deleted: true });
});

export default router;
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C4",
          expectedEvidence: [{ file: "src/routes/admin.ts", snippetSubstr: "router.delete('/admin/users/:id', (req, res)" }]
        }
      ],
      rationale: "The DELETE endpoint lacks authentication middleware, allowing unauthenticated user deletion."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTH-C5: Brute-Force Protection
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTH-FAIL-07",
      description: "Detects missing rate limit on standard login route",
      tags: ["missing-rate-limit", "brute-force", "login"],
      criteriaTargeted: ["AUTH-C5"],
      changedFiles: [
        {
          path: "src/routes.ts",
          content: `
import express from 'express';
import { loginHandler } from './auth';

const router = express.Router();
router.post('/login', loginHandler);

export default router;
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C5",
          expectedEvidence: [{ file: "src/routes.ts", snippetSubstr: "router.post('/login', loginHandler);" }]
        }
      ],
      rationale: "No rate limit middleware is applied to the login endpoint."
    },
    {
      id: "AUTH-PASS-02",
      description: "Rate limiting applied correctly to login",
      tags: ["rate-limiting", "brute-force", "secure"],
      criteriaTargeted: ["AUTH-C5"],
      changedFiles: [
        {
          path: "src/routes.ts",
          content: `
import express from 'express';
import rateLimit from 'express-rate-limit';
import { loginHandler } from './auth';

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
const router = express.Router();

router.post('/login', loginLimiter, loginHandler);

export default router;
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "express-rate-limit provides sufficient brute-force protection."
    },
    {
      id: "AUTH-PASS-03",
      description: "Custom account lockout logic",
      tags: ["account-lockout", "brute-force", "secure"],
      criteriaTargeted: ["AUTH-C5"],
      changedFiles: [
        {
          path: "src/auth.ts",
          content: `
export async function loginHandler(req, res) {
  const { username, password } = req.body;
  const user = await db.getUser(username);
  
  if (user.failedAttempts >= 5 && Date.now() - user.lastFailedAt < 900000) {
    return res.status(429).send("Account locked");
  }
  
  if (await bcrypt.compare(password, user.hash)) {
    await db.resetAttempts(username);
    return res.json({ success: true });
  } else {
    await db.incrementAttempts(username);
    return res.status(401).send();
  }
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Explicit account lockout mechanism prevents brute force."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTH-C6: Password Reset & Recovery
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTH-FAIL-16",
      description: "Password reset allows user enumeration via 404 response",
      tags: ["password-reset", "user-enumeration"],
      criteriaTargeted: ["AUTH-C6"],
      changedFiles: [
        {
          path: "src/reset.ts",
          content: `
export async function forgotPassword(req, res) {
  const user = await db.getUserByEmail(req.body.email);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  await sendResetEmail(user);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C6",
          expectedEvidence: [{ file: "src/reset.ts", snippetSubstr: "res.status(404)" }]
        }
      ],
      rationale: "Returning 404 allows attackers to enumerate registered emails."
    },
    {
      id: "AUTH-FAIL-17",
      description: "Predictable password reset token via Math.random",
      tags: ["password-reset", "weak-randomness"],
      criteriaTargeted: ["AUTH-C6"],
      changedFiles: [
        {
          path: "src/reset.ts",
          content: `
export async function generateResetToken(userId) {
  const token = Math.random().toString(36).substring(2);
  await db.saveToken(userId, token);
  return token;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C6",
          expectedEvidence: [{ file: "src/reset.ts", snippetSubstr: "Math.random()" }]
        }
      ],
      rationale: "Math.random() is not cryptographically secure, leading to predictable tokens."
    },
    {
      id: "AUTH-FAIL-19",
      description: "Password reset logic doesn't expire or delete tokens",
      tags: ["password-reset", "logic-flaw"],
      criteriaTargeted: ["AUTH-C6"],
      changedFiles: [
        {
          path: "src/reset.ts",
          content: `
export async function handleReset(req, res) {
  const { token, newPassword } = req.body;
  const resetRecord = await db.getResetToken(token);
  if (!resetRecord) return res.status(400).send();
  
  // Token never expires and is never deleted after use!
  await updatePassword(resetRecord.userId, newPassword);
  res.send("Password updated");
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C6",
          expectedEvidence: [{ file: "src/reset.ts", snippetSubstr: "updatePassword" }]
        }
      ],
      rationale: "Reset tokens must be single-use and time-limited."
    },
    {
      id: "AUTH-PASS-09",
      description: "Secure password reset with crypto random tokens and expiry",
      tags: ["password-reset", "secure"],
      criteriaTargeted: ["AUTH-C6"],
      changedFiles: [
        {
          path: "src/reset.ts",
          content: `
import crypto from 'crypto';

export async function forgotPassword(req, res) {
  const user = await db.getUserByEmail(req.body.email);
  // Always return success to prevent user enumeration
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 3600000; // 1 hour
    await db.saveResetToken(user.id, token, expiry);
    await sendResetEmail(user.email, token);
  }
  res.json({ message: "If an account exists, a reset email has been sent." });
}

export async function handleReset(req, res) {
  const { token, newPassword } = req.body;
  const resetRecord = await db.getResetToken(token);
  if (!resetRecord || resetRecord.expiry < Date.now()) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }
  await updatePassword(resetRecord.userId, newPassword);
  await db.deleteResetToken(token);
  await db.invalidateAllSessions(resetRecord.userId);
  res.json({ message: "Password updated successfully" });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Crypto random tokens, 1-hour expiry, single-use deletion, no user enumeration."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTH-C7: Multi-Factor Authentication
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTH-FAIL-26",
      description: "MFA bypass via parameter manipulation",
      tags: ["mfa", "bypass", "parameter-manipulation"],
      criteriaTargeted: ["AUTH-C7"],
      changedFiles: [
        {
          path: "src/auth/login.ts",
          content: `
export async function login(req, res) {
  const { username, password, skipMfa } = req.body;
  const user = await db.getUser(username);
  
  if (!(await bcrypt.compare(password, user.hash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  
  // MFA can be skipped by sending skipMfa: true
  if (user.mfaEnabled && !skipMfa) {
    return res.json({ requireMfa: true, tempToken: generateTempToken(user.id) });
  }
  
  req.session.userId = user.id;
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C7",
          expectedEvidence: [{ file: "src/auth/login.ts", snippetSubstr: "!skipMfa" }]
        }
      ],
      rationale: "MFA can be bypassed by setting skipMfa=true in the request body."
    },
    {
      id: "AUTH-FAIL-27",
      description: "TOTP secret stored in plaintext in database",
      tags: ["mfa", "totp", "insecure-storage"],
      criteriaTargeted: ["AUTH-C7"],
      changedFiles: [
        {
          path: "src/auth/mfa.ts",
          content: `
import speakeasy from 'speakeasy';

export async function enableMfa(req, res) {
  const secret = speakeasy.generateSecret({ length: 20 });
  // Storing TOTP secret in plaintext
  await db.query('UPDATE users SET totp_secret = ? WHERE id = ?', [secret.base32, req.user.id]);
  res.json({ secret: secret.otpauth_url });
}

export async function verifyMfa(req, res) {
  const user = await db.getUser(req.user.id);
  const verified = speakeasy.totp.verify({
    secret: user.totp_secret,
    encoding: 'base32',
    token: req.body.token
  });
  if (verified) {
    req.session.mfaVerified = true;
    return res.json({ success: true });
  }
  res.status(401).json({ error: "Invalid MFA code" });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C7",
          expectedEvidence: [{ file: "src/auth/mfa.ts", snippetSubstr: "SET totp_secret = ?" }]
        }
      ],
      rationale: "TOTP secrets must be encrypted at rest, not stored in plaintext."
    },
    {
      id: "AUTH-FAIL-28",
      description: "MFA enrollment without re-authentication",
      tags: ["mfa", "enrollment", "re-auth"],
      criteriaTargeted: ["AUTH-C7"],
      changedFiles: [
        {
          path: "src/routes/settings.ts",
          content: `
import { requireAuth } from '../middleware';
import { enableMfa, disableMfa } from '../auth/mfa';

const router = express.Router();

// MFA can be enabled/disabled without re-entering password
router.post('/settings/mfa/enable', requireAuth, enableMfa);
router.post('/settings/mfa/disable', requireAuth, disableMfa);

export default router;
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C7",
          expectedEvidence: [{ file: "src/routes/settings.ts", snippetSubstr: "requireAuth, enableMfa" }]
        }
      ],
      rationale: "MFA enrollment and unenrollment must require re-authentication (password confirmation)."
    },
    {
      id: "AUTH-NV-03",
      description: "No MFA implementation in changed files",
      tags: ["mfa", "not-present"],
      criteriaTargeted: ["AUTH-C7"],
      changedFiles: [
        {
          path: "src/auth.ts",
          content: `
import bcrypt from 'bcrypt';

export async function login(req, res) {
  const { username, password } = req.body;
  const user = await db.getUser(username);
  if (!user || !(await bcrypt.compare(password, user.hash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  req.session.userId = user.id;
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "No MFA implementation is present — this is not a finding per C7 specification, so the auth code itself should pass on other criteria visible."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTH-C8: Session & Token Creation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTH-FAIL-08",
      description: "Session fixation vulnerability (no regeneration)",
      tags: ["session-fixation", "session-management"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/auth.ts",
          content: `
export async function loginHandler(req, res) {
  const { user, pass } = req.body;
  const valid = await checkUser(user, pass);
  if (valid) {
    req.session.userId = user.id;
    return res.json({ success: true });
  }
  return res.status(401).send();
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C8",
          expectedEvidence: [{ file: "src/auth.ts", snippetSubstr: "req.session.userId = user.id;" }]
        }
      ],
      rationale: "Session is not regenerated (e.g. req.session.regenerate) after authentication."
    },
    {
      id: "AUTH-FAIL-09",
      description: "Session cookie without HttpOnly",
      tags: ["cookie-flags", "session-management"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import session from 'express-session';
app.use(session({
  secret: 'mysecret',
  cookie: { httpOnly: false, secure: true }
}));
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C8",
          expectedEvidence: [{ file: "src/app.ts", snippetSubstr: "httpOnly: false" }]
        }
      ],
      rationale: "HttpOnly must be enabled to prevent XSS session theft."
    },
    {
      id: "AUTH-FAIL-10",
      description: "Session cookie without Secure flag",
      tags: ["cookie-flags", "session-management"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import session from 'express-session';
app.use(session({
  secret: 'mysecret',
  cookie: { httpOnly: true, secure: false }
}));
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C8",
          expectedEvidence: [{ file: "src/app.ts", snippetSubstr: "secure: false" }]
        }
      ],
      rationale: "Secure flag must be set for cookies."
    },
    {
      id: "AUTH-FAIL-20",
      description: "SameSite attribute set to none on session cookie",
      tags: ["cookie-flags", "session-management"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import session from 'express-session';
app.use(session({
  secret: 'mysecret',
  cookie: { httpOnly: true, secure: true, sameSite: 'none' }
}));
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C8",
          expectedEvidence: [{ file: "src/app.ts", snippetSubstr: "sameSite: 'none'" }]
        }
      ],
      rationale: "SameSite 'none' exposes session cookie to CSRF; must use Lax or Strict."
    },
    {
      id: "AUTH-FAIL-13",
      description: "JWT generated with a hardcoded secret",
      tags: ["jwt", "hardcoded-secret", "token-security"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/tokens.ts",
          content: `
import jwt from 'jsonwebtoken';

export function createToken(user) {
  return jwt.sign({ id: user.id }, 'supersecret123', { expiresIn: '1h' });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C8",
          expectedEvidence: [{ file: "src/tokens.ts", snippetSubstr: "'supersecret123'" }]
        }
      ],
      rationale: "Hardcoded JWT secrets violate C8."
    },
    {
      id: "AUTH-FAIL-14",
      description: "JWT verification explicitly allowing 'none' algorithm",
      tags: ["jwt", "none-alg", "token-security"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/tokens.ts",
          content: `
import jwt from 'jsonwebtoken';

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['none', 'HS256'] });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C8",
          expectedEvidence: [{ file: "src/tokens.ts", snippetSubstr: "'none'" }]
        }
      ],
      rationale: "Allowing the 'none' algorithm enables token forgery."
    },
    {
      id: "AUTH-FAIL-15",
      description: "JWT generated without an expiration",
      tags: ["jwt", "missing-expiration", "token-security"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/tokens.ts",
          content: `
import jwt from 'jsonwebtoken';

export function createToken(user) {
  // Missing expiresIn option
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C8",
          expectedEvidence: [{ file: "src/tokens.ts", snippetSubstr: "jwt.sign({ id: user.id }" }]
        }
      ],
      rationale: "Tokens without expiration times live indefinitely, violating C8."
    },
    {
      id: "AUTH-FAIL-22",
      description: "Insecure JWT decoding used for authentication",
      tags: ["jwt", "bypass", "token-security"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/middleware.ts",
          content: `
import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization;
  // Using decode instead of verify skips signature validation
  const decoded = jwt.decode(token);
  if (decoded) {
    req.user = decoded;
    return next();
  }
  res.status(401).send();
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C8",
          expectedEvidence: [{ file: "src/middleware.ts", snippetSubstr: "jwt.decode" }]
        }
      ],
      rationale: "jwt.decode does not verify the signature, allowing token forgery."
    },
    {
      id: "AUTH-PASS-04",
      description: "Session securely regenerated on login",
      tags: ["session-fixation", "session-management", "secure"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/auth.ts",
          content: `
export async function loginHandler(req, res) {
  const { user, pass } = req.body;
  if (await checkUser(user, pass)) {
    req.session.regenerate((err) => {
      if (err) return res.status(500).send();
      req.session.userId = user.id;
      res.json({ success: true });
    });
    return;
  }
  return res.status(401).send();
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Session is properly regenerated, preventing fixation."
    },
    {
      id: "AUTH-PASS-05",
      description: "Secure JWT verification and signing",
      tags: ["jwt", "token-security", "secure"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/tokens.ts",
          content: `
import jwt from 'jsonwebtoken';

export function createToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
}
export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "JWT is used securely with env secrets, expiration, and restricted algorithms."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTH-C9: Logout & Session Invalidation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTH-FAIL-29",
      description: "Logout only clears client-side cookie without server-side invalidation",
      tags: ["logout", "session-invalidation", "client-only"],
      criteriaTargeted: ["AUTH-C9"],
      changedFiles: [
        {
          path: "src/auth/logout.ts",
          content: `
export function logout(req, res) {
  // Only clears the cookie, session remains valid on server
  res.clearCookie('session_id');
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C9",
          expectedEvidence: [{ file: "src/auth/logout.ts", snippetSubstr: "res.clearCookie('session_id')" }]
        }
      ],
      rationale: "Logout must destroy the session server-side, not just clear the client cookie."
    },
    {
      id: "AUTH-FAIL-30",
      description: "JWT-based logout with no token revocation mechanism",
      tags: ["logout", "jwt", "no-revocation"],
      criteriaTargeted: ["AUTH-C9"],
      changedFiles: [
        {
          path: "src/auth/logout.ts",
          content: `
export function logout(req, res) {
  // JWT cannot be invalidated - no blacklist/revocation mechanism
  // Token remains valid until expiration (24 hours)
  res.json({ message: "Logged out" });
}
`.trim()
        },
        {
          path: "src/tokens.ts",
          content: `
import jwt from 'jsonwebtoken';

export function createToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C9",
          expectedEvidence: [{ file: "src/auth/logout.ts", snippetSubstr: "res.json({ message: \"Logged out\" })" }]
        }
      ],
      rationale: "JWT tokens with 24h expiry and no revocation mechanism means tokens remain valid after logout."
    },
    {
      id: "AUTH-FAIL-31",
      description: "Password change does not invalidate other sessions",
      tags: ["logout", "password-change", "session-invalidation"],
      criteriaTargeted: ["AUTH-C9"],
      changedFiles: [
        {
          path: "src/auth/password.ts",
          content: `
import bcrypt from 'bcrypt';

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = await db.getUser(req.session.userId);
  
  if (!(await bcrypt.compare(currentPassword, user.hash))) {
    return res.status(401).json({ error: "Current password incorrect" });
  }
  
  const newHash = await bcrypt.hash(newPassword, 12);
  await db.updatePassword(user.id, newHash);
  
  // Does not invalidate other active sessions!
  res.json({ message: "Password changed successfully" });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C9",
          expectedEvidence: [{ file: "src/auth/password.ts", snippetSubstr: "db.updatePassword(user.id, newHash)" }]
        }
      ],
      rationale: "After password change, other active sessions should be invalidated to prevent continued unauthorized access."
    },
    {
      id: "AUTH-PASS-10",
      description: "Proper server-side session destruction on logout",
      tags: ["logout", "session-invalidation", "secure"],
      criteriaTargeted: ["AUTH-C9"],
      changedFiles: [
        {
          path: "src/auth/logout.ts",
          content: `
export function logout(req, res) {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Session is properly destroyed server-side before clearing the client cookie."
    },

    // ═══════════════════════════════════════════════════════════════════
    // AUTH-C10: Error Message Information Disclosure
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTH-FAIL-18",
      description: "Distinct error message for incorrect password vs user not found",
      tags: ["error-handling", "login", "user-enumeration"],
      criteriaTargeted: ["AUTH-C10"],
      changedFiles: [
        {
          path: "src/login.ts",
          content: `
export async function login(req, res) {
  const user = await db.getUser(req.body.username);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }
  if (!await bcrypt.compare(req.body.password, user.hash)) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  res.json({ success: true, token: generateToken() });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C10",
          expectedEvidence: [{ file: "src/login.ts", snippetSubstr: "User not found" }]
        }
      ],
      rationale: "Distinct messages enable enumeration attacks (C10)."
    },
    {
      id: "AUTH-FAIL-32",
      description: "Stack trace leaked in authentication error response",
      tags: ["error-handling", "stack-trace", "information-disclosure"],
      criteriaTargeted: ["AUTH-C10"],
      changedFiles: [
        {
          path: "src/controllers/auth.ts",
          content: `
export async function login(req, res) {
  try {
    const { username, password } = req.body;
    const user = await db.getUser(username);
    if (await bcrypt.compare(password, user.hash)) {
      return res.json({ success: true });
    }
    res.status(401).json({ error: "Invalid credentials" });
  } catch (err) {
    // Stack trace exposed to client
    res.status(500).json({ 
      error: "Authentication failed", 
      stack: err.stack,
      details: err.message
    });
  }
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C10",
          expectedEvidence: [{ file: "src/controllers/auth.ts", snippetSubstr: "stack: err.stack" }]
        }
      ],
      rationale: "Stack traces and internal error details must never be exposed to clients."
    },
    {
      id: "AUTH-FAIL-33",
      description: "Registration endpoint reveals whether email is already registered",
      tags: ["error-handling", "registration", "user-enumeration"],
      criteriaTargeted: ["AUTH-C10"],
      changedFiles: [
        {
          path: "src/controllers/register.ts",
          content: `
import bcrypt from 'bcrypt';

export async function register(req, res) {
  const { email, password } = req.body;
  const existing = await db.getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }
  const hash = await bcrypt.hash(password, 12);
  await db.createUser(email, hash);
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C10",
          expectedEvidence: [{ file: "src/controllers/register.ts", snippetSubstr: "An account with this email already exists" }]
        }
      ],
      rationale: "Registration must not reveal whether an email is already registered."
    },
    {
      id: "AUTH-PASS-06",
      description: "Generic error message for both invalid user and invalid password",
      tags: ["error-handling", "login", "secure"],
      criteriaTargeted: ["AUTH-C10"],
      changedFiles: [
        {
          path: "src/login.ts",
          content: `
export async function login(req, res) {
  const user = await db.getUser(req.body.username);
  if (!user || !(await bcrypt.compare(req.body.password, user.hash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  res.json({ success: true });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Generic error message properly prevents enumeration."
    },

    // ═══════════════════════════════════════════════════════════════════
    // Cross-Cutting Scenarios
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "AUTH-PASS-07",
      description: "Standard Next.js Auth.js integration",
      tags: ["oauth", "library", "secure"],
      criteriaTargeted: ["AUTH-C1", "AUTH-C8"],
      changedFiles: [
        {
          path: "src/auth.ts",
          content: `
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [GitHub],
})
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Standard library integration, no explicit flaws visible."
    },
    {
      id: "AUTH-NV-02",
      description: "PR changes only CSS files",
      tags: ["unrelated", "missing-context"],
      criteriaTargeted: [],
      changedFiles: [
        {
          path: "src/styles.css",
          content: `
.button {
  color: red;
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "No authentication logic is present to evaluate."
    },
  ]
};
