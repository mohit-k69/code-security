import type { EvalDataset } from "../types";

export const AuthenticationEvalDataset: EvalDataset = {
  checkpointId: "SEC-AUTH-001",
  version: "1.0",
  scenarios: [
    // ─── AUTH-C1: Password Storage ──────────────────────────────────────
    {
      id: "AUTH-FAIL-01",
      description: "Detects plaintext password storage during registration",
      tags: ["plaintext", "password-storage"],
      criteriaTargeted: ["AUTH-C1"],
      changedFiles: [
        {
          path: "src/controllers/auth",
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
          expectedEvidence: [{ file: "src/controllers/auth", snippetSubstr: "VALUES (?, ?)'" }]
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
          path: "src/controllers/auth",
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
          expectedEvidence: [{ file: "src/controllers/auth", snippetSubstr: "user.password === password" }]
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
          path: "src/controllers/auth",
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
          expectedEvidence: [{ file: "src/controllers/auth", snippetSubstr: "createHash('md5')" }]
        }
      ],
      rationale: "MD5 is specifically called out as weak in C1."
    },
    {
      id: "AUTH-FAIL-04",
      description: "Detects SHA-256 hashing without salt for passwords",
      tags: ["sha256", "password-storage", "no-salt"],
      criteriaTargeted: ["AUTH-C1"],
      changedFiles: [
        {
          path: "src/controllers/auth",
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
          expectedEvidence: [{ file: "src/controllers/auth", snippetSubstr: "createHash('sha256')" }]
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
          path: "src/controllers/auth",
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
          path: "src/controllers/auth",
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

    // ─── AUTH-C2: Credential Transmission ─────────────────────────────
    {
      id: "AUTH-FAIL-05",
      description: "Detects password logging during error handling",
      tags: ["logging", "transmission", "credentials"],
      criteriaTargeted: ["AUTH-C2"],
      changedFiles: [
        {
          path: "src/controllers/auth",
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
          expectedEvidence: [{ file: "src/controllers/auth", snippetSubstr: "pwd:\", req.body.password" }]
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
          path: "src/routes",
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
          expectedEvidence: [{ file: "src/routes", snippetSubstr: "req.query.password" }]
        }
      ],
      rationale: "Passwords must not appear in URLs or query params (C2)."
    },

    // ─── AUTH-C3: Brute-Force Protection ──────────────────────────────
    {
      id: "AUTH-FAIL-07",
      description: "Detects missing rate limit on standard login route",
      tags: ["missing-rate-limit", "brute-force", "login"],
      criteriaTargeted: ["AUTH-C3"],
      changedFiles: [
        {
          path: "src/routes",
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
          criterionId: "AUTH-C3",
          expectedEvidence: [{ file: "src/routes", snippetSubstr: "router.post('/login', loginHandler);" }]
        }
      ],
      rationale: "No rate limit middleware is applied to the login endpoint."
    },
    {
      id: "AUTH-PASS-02",
      description: "Rate limiting applied correctly to login",
      tags: ["rate-limiting", "brute-force", "secure"],
      criteriaTargeted: ["AUTH-C3"],
      changedFiles: [
        {
          path: "src/routes",
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
      criteriaTargeted: ["AUTH-C3"],
      changedFiles: [
        {
          path: "src/auth",
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

    // ─── AUTH-C4: Session Management ──────────────────────────────────
    {
      id: "AUTH-FAIL-08",
      description: "Session fixation vulnerability (no regeneration)",
      tags: ["session-fixation", "session-management"],
      criteriaTargeted: ["AUTH-C4"],
      changedFiles: [
        {
          path: "src/auth",
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
          criterionId: "AUTH-C4",
          expectedEvidence: [{ file: "src/auth", snippetSubstr: "req.session.userId = user.id;" }]
        }
      ],
      rationale: "Session is not regenerated (e.g. req.session.regenerate) after authentication."
    },
    {
      id: "AUTH-FAIL-09",
      description: "Session cookie without HttpOnly",
      tags: ["cookie-flags", "session-management"],
      criteriaTargeted: ["AUTH-C4"],
      changedFiles: [
        {
          path: "src/app",
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
          criterionId: "AUTH-C4",
          expectedEvidence: [{ file: "src/app", snippetSubstr: "httpOnly: false" }]
        }
      ],
      rationale: "HttpOnly must be enabled to prevent XSS session theft."
    },
    {
      id: "AUTH-FAIL-10",
      description: "Session cookie without Secure flag",
      tags: ["cookie-flags", "session-management"],
      criteriaTargeted: ["AUTH-C4"],
      changedFiles: [
        {
          path: "src/app",
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
          criterionId: "AUTH-C4",
          expectedEvidence: [{ file: "src/app", snippetSubstr: "secure: false" }]
        }
      ],
      rationale: "Secure flag must be set for cookies."
    },
    {
      id: "AUTH-PASS-04",
      description: "Session securely regenerated on login",
      tags: ["session-fixation", "session-management", "secure"],
      criteriaTargeted: ["AUTH-C4"],
      changedFiles: [
        {
          path: "src/auth",
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

    // ─── AUTH-C5: Authentication Bypass ───────────────────────────────
    {
      id: "AUTH-FAIL-11",
      description: "Hardcoded debug backdoor bypassing authentication",
      tags: ["backdoor", "bypass"],
      criteriaTargeted: ["AUTH-C5"],
      changedFiles: [
        {
          path: "src/middleware",
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
          criterionId: "AUTH-C5",
          expectedEvidence: [{ file: "src/middleware", snippetSubstr: "x-debug-bypass" }]
        }
      ],
      rationale: "Debug backdoors allow complete bypass of authentication checks."
    },
    {
      id: "AUTH-FAIL-12",
      description: "Logic flaw in password check (null evaluation)",
      tags: ["logic-flaw", "bypass"],
      criteriaTargeted: ["AUTH-C5"],
      changedFiles: [
        {
          path: "src/auth",
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
          criterionId: "AUTH-C5",
          expectedEvidence: [{ file: "src/auth", snippetSubstr: "if (!password ||" }]
        }
      ],
      rationale: "Logic flaw allows bypass if no password is submitted."
    },

    // ─── AUTH-C6: Token Security ──────────────────────────────────────
    {
      id: "AUTH-FAIL-13",
      description: "JWT generated with a hardcoded secret",
      tags: ["jwt", "hardcoded-secret", "token-security"],
      criteriaTargeted: ["AUTH-C6"],
      changedFiles: [
        {
          path: "src/tokens",
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
          criterionId: "AUTH-C6",
          expectedEvidence: [{ file: "src/tokens", snippetSubstr: "'supersecret123'" }]
        }
      ],
      rationale: "Hardcoded JWT secrets violate C6."
    },
    {
      id: "AUTH-FAIL-14",
      description: "JWT verification explicitly allowing 'none' algorithm",
      tags: ["jwt", "none-alg", "token-security"],
      criteriaTargeted: ["AUTH-C6"],
      changedFiles: [
        {
          path: "src/tokens",
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
          criterionId: "AUTH-C6",
          expectedEvidence: [{ file: "src/tokens", snippetSubstr: "'none'" }]
        }
      ],
      rationale: "Allowing the 'none' algorithm enables token forgery."
    },
    {
      id: "AUTH-FAIL-15",
      description: "JWT generated without an expiration",
      tags: ["jwt", "missing-expiration", "token-security"],
      criteriaTargeted: ["AUTH-C6"],
      changedFiles: [
        {
          path: "src/tokens",
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
          criterionId: "AUTH-C6",
          expectedEvidence: [{ file: "src/tokens", snippetSubstr: "jwt.sign({ id: user.id }" }]
        }
      ],
      rationale: "Tokens without expiration times live indefinitely, violating C6."
    },
    {
      id: "AUTH-PASS-05",
      description: "Secure JWT verification and signing",
      tags: ["jwt", "token-security", "secure"],
      criteriaTargeted: ["AUTH-C6"],
      changedFiles: [
        {
          path: "src/tokens",
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

    // ─── AUTH-C7: Password Reset Flow ─────────────────────────────────
    {
      id: "AUTH-FAIL-16",
      description: "Password reset allows user enumeration via 404 response",
      tags: ["password-reset", "user-enumeration"],
      criteriaTargeted: ["AUTH-C7"],
      changedFiles: [
        {
          path: "src/reset",
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
          criterionId: "AUTH-C7",
          expectedEvidence: [{ file: "src/reset", snippetSubstr: "res.status(404)" }]
        }
      ],
      rationale: "Returning 404 allows attackers to enumerate registered emails."
    },
    {
      id: "AUTH-FAIL-17",
      description: "Predictable password reset token via Math.random",
      tags: ["password-reset", "weak-randomness"],
      criteriaTargeted: ["AUTH-C7"],
      changedFiles: [
        {
          path: "src/reset",
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
          criterionId: "AUTH-C7",
          expectedEvidence: [{ file: "src/reset", snippetSubstr: "Math.random()" }]
        }
      ],
      rationale: "Math.random() is not cryptographically secure, leading to predictable tokens."
    },

    // ─── AUTH-C8: Error Handling ──────────────────────────────────────
    {
      id: "AUTH-FAIL-18",
      description: "Distinct error message for incorrect password vs user not found",
      tags: ["error-handling", "login", "user-enumeration"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/login",
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
          criterionId: "AUTH-C8",
          expectedEvidence: [{ file: "src/login", snippetSubstr: "User not found" }] // Just one example
        }
      ],
      rationale: "Distinct messages enable enumeration attacks (C8)."
    },
    {
      id: "AUTH-PASS-06",
      description: "Generic error message for both invalid user and invalid password",
      tags: ["error-handling", "login", "secure"],
      criteriaTargeted: ["AUTH-C8"],
      changedFiles: [
        {
          path: "src/login",
          content: `
export async function login(req, res) {
  const user = await db.getUser(req.body.username);
  if (!user || !(await bcrypt.compare(req.body.password, user.hash))) {
    // Avoid timing attacks by always hashing (simplified for this test)
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

    // ─── Additional Scenarios (Padding out to 30) ─────────────────────
    {
      id: "AUTH-FAIL-19",
      description: "Password reset logic doesn't expire tokens",
      tags: ["password-reset", "logic-flaw"],
      criteriaTargeted: ["AUTH-C7"],
      changedFiles: [
        {
          path: "src/reset",
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
          criterionId: "AUTH-C7",
          expectedEvidence: [{ file: "src/reset", snippetSubstr: "updatePassword" }]
        }
      ],
      rationale: "Reset tokens must be single-use and time-limited."
    },
    {
      id: "AUTH-FAIL-20",
      description: "Missing SameSite attribute on session cookie",
      tags: ["cookie-flags", "session-management"],
      criteriaTargeted: ["AUTH-C4"],
      changedFiles: [
        {
          path: "src/app",
          content: `
import session from 'express-session';
app.use(session({
  secret: 'mysecret',
  cookie: { httpOnly: true, secure: true, sameSite: 'none' } // sameSite none without conditions or CSRF token
}));
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "AUTH-C4",
          expectedEvidence: [{ file: "src/app", snippetSubstr: "sameSite: 'none'" }]
        }
      ],
      rationale: "SameSite 'none' can lead to CSRF if not handled correctly. Strictly speaking, C4 mentions secure flags."
    },
    {
      id: "AUTH-PASS-07",
      description: "Standard Next.js Auth.js integration",
      tags: ["oauth", "library", "secure"],
      criteriaTargeted: ["AUTH-C1", "AUTH-C4"],
      changedFiles: [
        {
          path: "src/auth",
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
      expectedVerdict: "PASS", // No auth logic modified, so no issues found. Or NOT_VERIFIED depending on strictness. Let's say PASS because it didn't introduce issues.
      rationale: "No authentication logic is present to evaluate."
    },
    {
      id: "AUTH-FAIL-21",
      description: "JWT sent in query parameters",
      tags: ["jwt", "transmission", "token-security"],
      criteriaTargeted: ["AUTH-C2", "AUTH-C6"],
      changedFiles: [
        {
          path: "src/redirect",
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
          criterionId: "AUTH-C2", // Can be C2 or C6
          expectedEvidence: [{ file: "src/redirect", snippetSubstr: "?token=" }]
        }
      ],
      rationale: "Tokens should not be transmitted in URL parameters due to logging."
    },
    {
      id: "AUTH-FAIL-22",
      description: "Insecure JWT decoding used for authentication",
      tags: ["jwt", "bypass", "token-security"],
      criteriaTargeted: ["AUTH-C6"],
      changedFiles: [
        {
          path: "src/middleware",
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
          criterionId: "AUTH-C6",
          expectedEvidence: [{ file: "src/middleware", snippetSubstr: "jwt.decode" }]
        }
      ],
      rationale: "jwt.decode does not verify the signature, allowing token forgery."
    }
  ]
};
