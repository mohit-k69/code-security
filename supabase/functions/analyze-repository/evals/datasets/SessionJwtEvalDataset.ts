import type { EvalDataset } from "../types.ts";

export const SessionJwtEvalDataset: EvalDataset = {
  checkpointId: "SEC-SESSION-001",
  version: "1.0",
  scenarios: [
    // ═══════════════════════════════════════════════════════════════════
    // SESSION-C1: Secure Session Creation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SESSION-FAIL-01",
      description: "Weak JWT signing algorithm (none)",
      tags: ["jwt", "creation", "algorithm", "none"],
      criteriaTargeted: ["SESSION-C1", "SESSION-C2"],
      changedFiles: [
        {
          path: "src/auth/tokens.ts",
          content: `
import jwt from 'jsonwebtoken';

export function createUnsecureToken(user) {
  // Using the 'none' algorithm which disables signature verification
  return jwt.sign({ id: user.id }, 'secret', { algorithm: 'none' });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C1",
          expectedEvidence: [{ file: "src/auth/tokens.ts", snippetSubstr: "algorithm: 'none'" }]
        }
      ],
      rationale: "Using the 'none' algorithm allows attackers to forge tokens and bypass authentication entirely."
    },
    {
      id: "SESSION-FAIL-02",
      description: "Predictable session IDs (Math.random)",
      tags: ["session", "creation", "prng"],
      criteriaTargeted: ["SESSION-C1"],
      changedFiles: [
        {
          path: "src/session/manager.ts",
          content: `
export function createSessionId() {
  // Using weak PRNG for session IDs
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C1",
          expectedEvidence: [{ file: "src/session/manager.ts", snippetSubstr: "Math.random()" }]
        }
      ],
      rationale: "Session IDs must be generated using cryptographically secure random number generators (e.g., crypto.randomBytes)."
    },
    {
      id: "SESSION-PASS-01",
      description: "Secure session ID generation",
      tags: ["secure", "session", "creation", "crypto"],
      criteriaTargeted: ["SESSION-C1"],
      changedFiles: [
        {
          path: "src/session/manager.ts",
          content: `
import crypto from 'crypto';

export function createSessionId() {
  // Using CSPRNG
  return crypto.randomBytes(32).toString('hex');
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Generates unpredictable, high-entropy session IDs using a cryptographic library."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SESSION-C2: JWT Validation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SESSION-FAIL-03",
      description: "Using jwt.decode() instead of jwt.verify()",
      tags: ["jwt", "validation", "decode"],
      criteriaTargeted: ["SESSION-C2"],
      changedFiles: [
        {
          path: "src/middleware/auth.ts",
          content: `
import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).send();
  
  // CRITICAL VULNERABILITY: Decoding without verifying signature
  const decoded = jwt.decode(token);
  if (!decoded) return res.status(401).send();
  
  req.user = decoded;
  next();
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C2",
          expectedEvidence: [{ file: "src/middleware/auth.ts", snippetSubstr: "jwt.decode(token)" }]
        }
      ],
      rationale: "jwt.decode() only parses the token payload. It does not verify the signature, allowing attackers to forge arbitrary tokens."
    },
    {
      id: "SESSION-FAIL-04",
      description: "Missing algorithm restriction in verify()",
      tags: ["jwt", "validation", "algorithm-confusion"],
      criteriaTargeted: ["SESSION-C2"],
      changedFiles: [
        {
          path: "src/middleware/auth.ts",
          content: `
import jwt from 'jsonwebtoken';
import fs from 'fs';

const publicKey = fs.readFileSync('public.pem');

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  // Vulnerable to algorithm confusion if algorithms array is not specified
  jwt.verify(token, publicKey, (err, decoded) => {
    if (err) return res.status(401).send();
    req.user = decoded;
    next();
  });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C2",
          expectedEvidence: [{ file: "src/middleware/auth.ts", snippetSubstr: "jwt.verify(token, publicKey," }]
        }
      ],
      rationale: "When verifying with an asymmetric key, the allowed algorithms must be explicitly restricted (e.g., algorithms: ['RS256']) to prevent algorithm confusion attacks where the attacker signs the token using HMAC with the public key."
    },
    {
      id: "SESSION-FAIL-05",
      description: "Ignoring token expiration during verify",
      tags: ["jwt", "validation", "expiration"],
      criteriaTargeted: ["SESSION-C2"],
      changedFiles: [
        {
          path: "src/middleware/auth.ts",
          content: `
import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  // Explicitly disabling expiration checks
  jwt.verify(token, process.env.SECRET, { ignoreExpiration: true }, (err, decoded) => {
    if (err) return res.status(401).send();
    req.user = decoded;
    next();
  });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C2",
          expectedEvidence: [{ file: "src/middleware/auth.ts", snippetSubstr: "ignoreExpiration: true" }]
        }
      ],
      rationale: "Ignoring token expiration allows stolen tokens to be used indefinitely."
    },
    {
      id: "SESSION-PASS-02",
      description: "Secure JWT verification with algorithms and audience",
      tags: ["secure", "jwt", "validation"],
      criteriaTargeted: ["SESSION-C2"],
      changedFiles: [
        {
          path: "src/middleware/auth.ts",
          content: `
import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  // Secure verification enforcing algorithm, audience, and issuer
  jwt.verify(token, process.env.JWT_SECRET, { 
    algorithms: ['HS256'],
    audience: 'https://api.myapp.com',
    issuer: 'https://auth.myapp.com'
  }, (err, decoded) => {
    if (err) return res.status(401).send();
    req.user = decoded;
    next();
  });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Strictly verifies the signature, enforces algorithms, and checks critical claims like audience and issuer."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SESSION-C3: Session & Token Expiration
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SESSION-FAIL-06",
      description: "JWT created without expiration",
      tags: ["expiration", "jwt", "no-expiry"],
      criteriaTargeted: ["SESSION-C3"],
      changedFiles: [
        {
          path: "src/auth/login.ts",
          content: `
import jwt from 'jsonwebtoken';

export function login(user) {
  // Missing expiresIn option
  return jwt.sign({ id: user.id }, process.env.SECRET);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C3",
          expectedEvidence: [{ file: "src/auth/login.ts", snippetSubstr: "jwt.sign({ id: user.id }, process.env.SECRET)" }]
        }
      ],
      rationale: "Access tokens should have short lifetimes. Tokens without expiration can be abused indefinitely if compromised."
    },
    {
      id: "SESSION-FAIL-07",
      description: "Express session without cookie expiration",
      tags: ["expiration", "session", "express"],
      criteriaTargeted: ["SESSION-C3"],
      changedFiles: [
        {
          path: "src/app.ts",
          content: `
import session from 'express-session';

app.use(session({
  secret: 'mysecret',
  resave: false,
  saveUninitialized: true,
  // Cookie lacks 'maxAge' or 'expires', making it a session cookie that lasts 
  // until the browser is closed (which could be days/weeks), but the backend 
  // session never automatically cleans up.
  cookie: { secure: true }
}));
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C3",
          expectedEvidence: [{ file: "src/app.ts", snippetSubstr: "cookie: { secure: true }" }]
        }
      ],
      rationale: "Sessions should have explicit absolute or idle timeouts configured via cookie maxAge."
    },
    {
      id: "SESSION-PASS-03",
      description: "JWT with explicit short expiration",
      tags: ["secure", "expiration", "jwt"],
      criteriaTargeted: ["SESSION-C3"],
      changedFiles: [
        {
          path: "src/auth/login.ts",
          content: `
import jwt from 'jsonwebtoken';

export function login(user) {
  // Expiration explicitly set to 15 minutes
  return jwt.sign({ id: user.id }, process.env.SECRET, { expiresIn: '15m' });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The token correctly implements a short expiration time."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SESSION-C4: Refresh Token Security
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SESSION-FAIL-08",
      description: "Blindly trusting refresh tokens without database validation",
      tags: ["refresh-token", "no-revocation-check"],
      criteriaTargeted: ["SESSION-C4"],
      changedFiles: [
        {
          path: "src/auth/refresh.ts",
          content: `
import jwt from 'jsonwebtoken';

export function refreshTokens(req, res) {
  const { refreshToken } = req.body;
  
  // Fails to verify if the refresh token was revoked in the DB
  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    const newAccess = jwt.sign({ id: decoded.id }, process.env.SECRET, { expiresIn: '15m' });
    res.json({ accessToken: newAccess });
  } catch (err) {
    res.status(401).send();
  }
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C4",
          expectedEvidence: [{ file: "src/auth/refresh.ts", snippetSubstr: "jwt.verify(refreshToken," }]
        }
      ],
      rationale: "Refresh tokens must be validated against a backend state (database/cache) to ensure they haven't been revoked via logout or password reset."
    },
    {
      id: "SESSION-FAIL-09",
      description: "Storing refresh tokens in plaintext in DB",
      tags: ["refresh-token", "storage", "plaintext"],
      criteriaTargeted: ["SESSION-C4"],
      changedFiles: [
        {
          path: "src/auth/login.ts",
          content: `
import crypto from 'crypto';

export async function createRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex');
  // Storing the token in plaintext instead of hashing it
  await db.query('INSERT INTO refresh_tokens (user_id, token) VALUES (?, ?)', [userId, token]);
  return token;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C4",
          expectedEvidence: [{ file: "src/auth/login.ts", snippetSubstr: "INSERT INTO refresh_tokens" }]
        }
      ],
      rationale: "Refresh tokens are equivalent to passwords in a stateless system and should be hashed (e.g., bcrypt/SHA256) before database storage."
    },
    {
      id: "SESSION-PASS-04",
      description: "Secure refresh token validation and rotation",
      tags: ["secure", "refresh-token", "rotation"],
      criteriaTargeted: ["SESSION-C4"],
      changedFiles: [
        {
          path: "src/auth/refresh.ts",
          content: `
import crypto from 'crypto';

export async function refreshTokens(req, res) {
  const { token } = req.body;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  
  // Validates against DB to ensure it's not revoked
  const session = await db.query('SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = false', [hash]);
  if (!session) return res.status(401).send();
  
  // Rotates refresh token (Revoke old, issue new)
  await db.query('UPDATE refresh_tokens SET revoked = true WHERE id = ?', [session.id]);
  const newRefHash = generateAndStoreNewToken(session.user_id);
  
  res.json({ accessToken: generateAccess(session.user_id), refreshToken: newRefHash });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Validates the refresh token against the database, uses hashing for storage, and rotates the token upon use."
    },
    {
      id: "SESSION-PASS-05",
      description: "Refresh token replay detection (Future enhancement scenario)",
      tags: ["secure", "refresh-token", "replay-detection"],
      criteriaTargeted: ["SESSION-C4"],
      changedFiles: [
        {
          path: "src/auth/refresh.ts",
          content: `
export async function refresh(req, res) {
  const { token } = req.cookies;
  const session = await db.findToken(hash(token));
  
  if (session && session.revoked) {
    // REPLAY DETECTED: A previously used token was presented again.
    // Compromise detected: revoke ALL tokens in the token family.
    await db.revokeAllTokensForFamily(session.family_id);
    return res.status(401).send("Security alert: token reuse detected");
  }
  
  if (!session) return res.status(401).send();
  
  // Rotate normally
  await db.markAsRevoked(session.id);
  const newToken = issueNewToken(session.family_id);
  res.json({ token: newToken });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Implements strict refresh token rotation with replay detection that terminates the entire session family if an old token is reused."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SESSION-C5: Secure Cookie Configuration
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SESSION-FAIL-10",
      description: "Missing HttpOnly flag on auth cookie",
      tags: ["cookie", "httponly", "xss"],
      criteriaTargeted: ["SESSION-C5"],
      changedFiles: [
        {
          path: "src/auth/login.ts",
          content: `
export function login(req, res) {
  const token = generateToken();
  // Missing HttpOnly allows XSS theft
  res.cookie('session_id', token, { secure: true, sameSite: 'strict' });
  res.send('Logged in');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C5",
          expectedEvidence: [{ file: "src/auth/login.ts", snippetSubstr: "res.cookie('session_id', token, { secure: true, sameSite: 'strict' });" }]
        }
      ],
      rationale: "Authentication cookies must have the HttpOnly flag to prevent JavaScript (XSS) from accessing the session token."
    },
    {
      id: "SESSION-FAIL-11",
      description: "Missing Secure flag on auth cookie",
      tags: ["cookie", "secure-flag", "interception"],
      criteriaTargeted: ["SESSION-C5"],
      changedFiles: [
        {
          path: "src/auth/login.ts",
          content: `
export function login(req, res) {
  const token = generateToken();
  // Missing Secure flag means cookie can be transmitted over unencrypted HTTP
  res.cookie('auth_token', token, { httpOnly: true });
  res.send('Logged in');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C5",
          expectedEvidence: [{ file: "src/auth/login.ts", snippetSubstr: "res.cookie('auth_token', token, { httpOnly: true });" }]
        }
      ],
      rationale: "Authentication cookies must have the Secure flag to ensure they are only transmitted over encrypted HTTPS connections."
    },
    {
      id: "SESSION-PASS-06",
      description: "Secure cookie configuration",
      tags: ["secure", "cookie"],
      criteriaTargeted: ["SESSION-C5"],
      changedFiles: [
        {
          path: "src/auth/login.ts",
          content: `
export function login(req, res) {
  const token = generateToken();
  // Perfectly configured secure cookie
  res.cookie('session_id', token, { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production', 
    sameSite: 'strict',
    maxAge: 3600000 
  });
  res.send('Logged in');
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Cookie explicitly enforces HttpOnly, Secure (conditionally for prod), and SameSite."
    },
    {
      id: "SESSION-NV-01",
      description: "Stateless JWT authentication (No cookies used)",
      tags: ["cookie", "not-applicable", "stateless"],
      criteriaTargeted: ["SESSION-C5"],
      changedFiles: [
        {
          path: "src/auth/login.ts",
          content: `
export function login(req, res) {
  const token = generateToken();
  // Token is returned in the JSON payload to be used as a Bearer token.
  // No cookies are involved.
  res.json({ token });
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "The application does not use cookies for authentication in this context, so cookie security criteria cannot be verified."
    },

    // ═══════════════════════════════════════════════════════════════════
    // SESSION-C6: Session Invalidation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SESSION-FAIL-12",
      description: "Logout fails to invalidate backend state",
      tags: ["invalidation", "logout", "state"],
      criteriaTargeted: ["SESSION-C6"],
      changedFiles: [
        {
          path: "src/auth/logout.ts",
          content: `
export function logout(req, res) {
  // Only clears the cookie on the client side
  res.clearCookie('session_id');
  
  // VULNERABILITY: Does not revoke the session or refresh token in the database.
  // If the token was captured, it remains fully valid.
  res.send('Logged out');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C6",
          expectedEvidence: [{ file: "src/auth/logout.ts", snippetSubstr: "res.clearCookie('session_id');" }]
        }
      ],
      rationale: "Clearing a client-side cookie does not invalidate the token. The backend must explicitly revoke the session/token in the database."
    },
    {
      id: "SESSION-FAIL-13",
      description: "Password reset fails to revoke active sessions",
      tags: ["invalidation", "password-reset"],
      criteriaTargeted: ["SESSION-C6"],
      changedFiles: [
        {
          path: "src/auth/password.ts",
          content: `
export async function resetPassword(req, res) {
  const { newPassword } = req.body;
  
  await db.updatePassword(req.user.id, hash(newPassword));
  // VULNERABILITY: Fails to revoke existing active sessions/refresh tokens for the user.
  
  res.send('Password updated');
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "SESSION-C6",
          expectedEvidence: [{ file: "src/auth/password.ts", snippetSubstr: "await db.updatePassword(req.user.id, hash(newPassword));" }]
        }
      ],
      rationale: "Security events like password resets, email changes, or account disablements MUST invalidate all previously issued sessions and refresh tokens."
    },
    {
      id: "SESSION-PASS-07",
      description: "Secure logout invalidates backend state",
      tags: ["secure", "invalidation", "logout"],
      criteriaTargeted: ["SESSION-C6"],
      changedFiles: [
        {
          path: "src/auth/logout.ts",
          content: `
export async function logout(req, res) {
  const sessionId = req.cookies.session_id;
  
  // Explicitly delete session from database
  await db.query('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
  
  res.clearCookie('session_id');
  res.send('Logged out');
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The backend session state is securely destroyed alongside the client-side cookie."
    },

    // ═══════════════════════════════════════════════════════════════════
    // Cross-Cutting Scenarios
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "SESSION-PASS-08",
      description: "Perfectly secured session endpoint",
      tags: ["comprehensive", "secure"],
      criteriaTargeted: ["SESSION-C1", "SESSION-C3", "SESSION-C5"],
      changedFiles: [
        {
          path: "src/auth/login.ts",
          content: `
import crypto from 'crypto';

export async function login(req, res) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  
  await db.query('INSERT INTO sessions (id, user_id, expires) VALUES (?, ?, ?)', 
    [sessionId, user.id, Date.now() + 3600000]);
    
  res.cookie('sid', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 3600000
  });
  
  res.send('OK');
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Uses CSPRNG for session ID, implements strict expiration in both DB and cookie, and utilizes all secure cookie flags."
    },
    {
      id: "SESSION-NV-02",
      description: "PR modifies database schema only",
      tags: ["unrelated", "schema"],
      criteriaTargeted: [],
      changedFiles: [
        {
          path: "db/migrations/102_add_index.sql",
          content: `
CREATE INDEX idx_users_email ON users(email);
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "No session or JWT management logic is present in the PR."
    },
    {
      id: "SESSION-NV-03",
      description: "Snippet with no visible token creation/signing context",
      tags: ["expiration", "not-applicable"],
      criteriaTargeted: ["SESSION-C3"],
      changedFiles: [
        {
          path: "src/auth/middleware.ts",
          content: `
export function checkAuth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).send();
  // Validates token but does not create/sign it here.
  // Missing context on whether it expires or not.
  next();
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "There is no JWT signing or session creation logic visible, so expiration cannot be verified."
    },
    {
      id: "SESSION-NV-04",
      description: "JWT generation delegated to an unseen external function",
      tags: ["delegated", "hidden-implementation"],
      criteriaTargeted: ["SESSION-C1", "SESSION-C3"],
      changedFiles: [
        {
          path: "src/auth/login.ts",
          content: `
import { createAuthToken } from '@company/internal-auth-lib';

export function login(user) {
  // We cannot verify if createAuthToken sets an expiration or uses a secure algorithm
  return createAuthToken(user.id);
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "The actual security implementation is completely hidden inside an imported external library function, preventing verification."
    },
    {
      id: "SESSION-PASS-09",
      description: "tc_004 style secure JWT creation",
      tags: ["jwt", "secure"],
      criteriaTargeted: ["SESSION-C1", "SESSION-C3"],
      changedFiles: [
        {
          path: "src/auth/token.js",
          content: `
const jwt = require('jsonwebtoken');
function generateToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The visible code demonstrates safe implementation of JWT creation with expiration and algorithm. Do not return NOT_VERIFIED simply because it is only one phase of the lifecycle."
    },
    {
      id: "SESSION-NV-05",
      description: "tc_023 style opaque nativeAuth.verify wrapper",
      tags: ["delegated", "hidden-implementation"],
      criteriaTargeted: ["SESSION-C1"],
      changedFiles: [
        {
          path: "src/auth/verify.js",
          content: `
function verifyUserToken(token) {
  // Implementation delegated to external C++ binding
  return nativeAuth.verify(token);
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "The core security mechanism is entirely delegated to an opaque nativeAuth.verify function, leaving no concrete security logic to evaluate."
    }
  ]
};
