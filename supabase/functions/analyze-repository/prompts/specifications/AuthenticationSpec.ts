// ─── Authentication Security Checkpoint ──────────────────────────
// SEC-AUTH-001 — Authentication Review v2.0
//
// Evaluates authentication implementations for security vulnerabilities
// across the full authentication lifecycle: credential handling, storage,
// transmission, session management, brute-force protection, password
// reset, MFA, logout, and error disclosure.
//
// Objective: Determine whether user identity is verified securely and
// whether authentication mechanisms follow industry best practices.

import type { ReviewSpecification } from "./ReviewSpecification.ts";

export const AuthenticationSpec: ReviewSpecification = {
  id: "SEC-AUTH-001",
  name: "Authentication Review",
  version: "2.0",
  category: "authentication",

  description:
    "Determines whether user identity is verified securely and whether " +
    "authentication mechanisms follow industry best practices. Evaluates " +
    "password storage and hashing, credential handling and transmission, " +
    "login flow security, authentication bypass risks, brute-force protection, " +
    "password reset and recovery, multi-factor authentication, session and " +
    "token creation, logout and session invalidation, and error message " +
    "information disclosure.",

  criteria: [
    // ────────────────────────────────────────────────────────────────
    // C1 — Password Storage & Hashing
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTH-C1",
      name: "Password Storage & Hashing",
      description:
        "Passwords must never be stored, compared, or persisted in plaintext, " +
        "Base64, or reversible encryption. " +
        "Acceptable hashing algorithms: bcrypt (cost ≥ 10), scrypt (N ≥ 16384), " +
        "Argon2id (memory ≥ 64 MB, iterations ≥ 3). " +
        "Reject MD5, SHA-1, SHA-256, and any unsalted hash for password storage. " +
        "Each password must use a unique, cryptographically random salt.\n\n" +
        "PASS: Passwords are hashed with an approved adaptive algorithm and unique salts. " +
        "No plaintext or weak-hash storage paths exist.\n" +
        "FAIL: Plaintext storage, reversible encryption, weak hashing (MD5/SHA), " +
        "missing salts, or insufficient work factors detected.\n" +
        "NOT_VERIFIED: No password storage logic is present in the changed files, " +
        "or the hashing implementation is in a dependency not included in the context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C2 — Credential Handling & Transmission
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTH-C2",
      name: "Credential Handling & Transmission",
      description:
        "Credentials (passwords, API keys, tokens) must only be transmitted " +
        "over encrypted channels (HTTPS/TLS). " +
        "Passwords must never appear in URLs, query parameters, GET request bodies, " +
        "or application logs (including debug, info, and error levels). " +
        "Credentials must not be stored in localStorage, sessionStorage, or cookies " +
        "without the Secure flag. " +
        "Form autocomplete for password fields should be managed appropriately.\n\n" +
        "PASS: All credential transmission uses secure channels; no credentials " +
        "leak into URLs, logs, or insecure storage.\n" +
        "FAIL: Credentials in URLs/query params, logged to console/files, stored " +
        "in insecure client-side storage, or transmitted over HTTP.\n" +
        "NOT_VERIFIED: Transport configuration is not visible in the changed files.",
    },

    // ────────────────────────────────────────────────────────────────
    // C3 — Login Flow Security
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTH-C3",
      name: "Login Flow Security",
      description:
        "The login flow must use constant-time comparison for credentials " +
        "to prevent timing attacks. " +
        "Login endpoints must validate all inputs (email format, password presence) " +
        "before processing. " +
        "The authentication decision must be made server-side; client-side checks " +
        "alone are insufficient. " +
        "OAuth/OIDC flows must validate the state parameter to prevent CSRF and " +
        "must verify the redirect URI against a whitelist.\n\n" +
        "PASS: Login flow performs server-side authentication with proper input " +
        "validation and timing-safe comparisons.\n" +
        "FAIL: Client-only authentication checks, missing input validation, " +
        "timing-vulnerable comparisons, or OAuth state/redirect not validated.\n" +
        "NOT_VERIFIED: Login flow logic is not present in the changed files.",
    },

    // ────────────────────────────────────────────────────────────────
    // C4 — Authentication Bypass Risks
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTH-C4",
      name: "Authentication Bypass Risks",
      description:
        "No code path should allow authentication to be skipped or bypassed. " +
        "Check for: missing authentication middleware on protected routes, " +
        "default or hardcoded credentials, debug/test backdoors left in production code, " +
        "logic flaws in conditional authentication checks (e.g., always-true conditions), " +
        "parameter manipulation that skips verification (e.g., isAdmin=true in request body), " +
        "and inconsistent enforcement across API versions or endpoints.\n\n" +
        "PASS: All protected routes require authentication; no backdoors, default " +
        "credentials, or bypassable logic exist.\n" +
        "FAIL: Unprotected routes, hardcoded credentials, debug bypasses, or logic " +
        "flaws that allow unauthenticated access detected.\n" +
        "NOT_VERIFIED: Route middleware configuration or auth guard setup is not " +
        "visible in the provided files.",
    },

    // ────────────────────────────────────────────────────────────────
    // C5 — Brute-Force Protection
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTH-C5",
      name: "Brute-Force Protection",
      description:
        "Authentication endpoints must implement rate limiting, progressive " +
        "delays, or account lockout to prevent brute-force and credential " +
        "stuffing attacks. " +
        "Rate limits should apply per IP and per account. " +
        "After repeated failures, the system should either lock the account " +
        "temporarily or require CAPTCHA/additional verification. " +
        "Lockout policies must not enable denial-of-service against legitimate users.\n\n" +
        "PASS: Rate limiting or account lockout is implemented on authentication " +
        "endpoints with appropriate thresholds.\n" +
        "FAIL: No rate limiting, no lockout mechanism, or thresholds are too " +
        "permissive (e.g., unlimited attempts allowed).\n" +
        "NOT_VERIFIED: Rate limiting is likely handled by infrastructure (API gateway, " +
        "WAF) not visible in the code.",
    },

    // ────────────────────────────────────────────────────────────────
    // C6 — Password Reset & Recovery
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTH-C6",
      name: "Password Reset & Recovery",
      description:
        "Password reset tokens must be cryptographically random (≥ 128 bits), " +
        "single-use, and time-limited (≤ 1 hour). " +
        "The reset flow must not reveal whether an account exists (no user enumeration). " +
        "Reset links must be transmitted over secure channels only. " +
        "Old passwords must be invalidated immediately after a successful reset. " +
        "Security questions alone are not acceptable as a recovery mechanism.\n\n" +
        "PASS: Reset tokens are random, single-use, and time-limited; the flow " +
        "does not leak account existence.\n" +
        "FAIL: Predictable tokens, reusable tokens, no expiration, user enumeration " +
        "via reset responses, or insecure token delivery.\n" +
        "NOT_VERIFIED: No password reset flow is present in the changed files.",
    },

    // ────────────────────────────────────────────────────────────────
    // C7 — Multi-Factor Authentication
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTH-C7",
      name: "Multi-Factor Authentication",
      description:
        "If MFA is implemented, evaluate: TOTP secrets must be generated with " +
        "sufficient entropy and stored securely (encrypted at rest). " +
        "Backup codes must be single-use and hashed. " +
        "MFA validation must occur server-side and must not be bypassable via " +
        "parameter manipulation or alternate endpoints. " +
        "MFA enrollment and unenrollment must require re-authentication. " +
        "If MFA is not present, this criterion does not apply.\n\n" +
        "PASS: MFA is correctly implemented with server-side validation, " +
        "secure secret storage, and non-bypassable enforcement.\n" +
        "FAIL: MFA can be bypassed, secrets stored insecurely, backup codes " +
        "reusable or unhashed, or enrollment lacks re-authentication.\n" +
        "NOT_VERIFIED: MFA is not implemented in the changed files (this is " +
        "not a finding — simply note its absence in the summary).",
    },

    // ────────────────────────────────────────────────────────────────
    // C8 — Session & Token Creation
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTH-C8",
      name: "Session & Token Creation",
      description:
        "Sessions must be regenerated after successful authentication to prevent " +
        "session fixation. " +
        "Session tokens must be cryptographically random and at least 128 bits. " +
        "Cookies carrying session tokens must set HttpOnly, Secure, and SameSite " +
        "flags (SameSite=Lax or Strict). " +
        "If JWT is used: signature validation must be enforced, the 'none' algorithm " +
        "must be explicitly rejected, tokens must have reasonable expiration (≤ 24h " +
        "for access tokens, ≤ 7d for refresh tokens), and signing secrets must not " +
        "be hardcoded or weak (< 256 bits).\n\n" +
        "PASS: Sessions are regenerated post-auth; tokens are random, properly " +
        "flagged, and have appropriate expiration.\n" +
        "FAIL: No session regeneration, predictable tokens, missing cookie flags, " +
        "JWT 'none' algorithm accepted, excessive token lifetimes, or weak/hardcoded secrets.\n" +
        "NOT_VERIFIED: Session/token creation logic is handled by a framework or " +
        "library not visible in the changed files.",
    },

    // ────────────────────────────────────────────────────────────────
    // C9 — Logout & Session Invalidation
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTH-C9",
      name: "Logout & Session Invalidation",
      description:
        "Logout must invalidate the session server-side (not just clear client cookies). " +
        "All active tokens (access, refresh) must be revoked upon logout. " +
        "After logout, the old session token must not grant access to protected resources. " +
        "For JWT-based systems, a token blacklist/revocation mechanism must exist, or " +
        "token lifetimes must be short enough that revocation is unnecessary. " +
        "Password changes should invalidate all other active sessions.\n\n" +
        "PASS: Logout performs server-side session destruction and token revocation; " +
        "old tokens cannot be reused.\n" +
        "FAIL: Client-side only logout, sessions remain valid after logout, no token " +
        "revocation, or password change does not invalidate other sessions.\n" +
        "NOT_VERIFIED: Logout implementation is not present in the changed files.",
    },

    // ────────────────────────────────────────────────────────────────
    // C10 — Error Message Information Disclosure
    // ────────────────────────────────────────────────────────────────
    {
      id: "AUTH-C10",
      name: "Error Message Information Disclosure",
      description:
        "Authentication error responses must return generic messages that do not " +
        "distinguish between 'invalid username' and 'invalid password' to prevent " +
        "user enumeration. " +
        "Stack traces, SQL errors, framework details, and internal system information " +
        "must never be exposed to clients in error responses. " +
        "Registration and password reset endpoints must also avoid leaking whether " +
        "a specific email/username is registered. " +
        "HTTP status codes should not differ between 'user not found' and 'wrong password'.\n\n" +
        "PASS: Error messages are generic and consistent; no internal details or " +
        "user existence information is leaked.\n" +
        "FAIL: Different error messages for invalid user vs invalid password, stack " +
        "traces in responses, or registration/reset reveals account existence.\n" +
        "NOT_VERIFIED: Error handling logic is not present in the changed files.",
    },
  ],

  promptInstruction:
    "Focus your analysis on the changed files. For each criterion, determine " +
    "whether the code introduces, modifies, or fails to address the security concern.\n\n" +

    "### Finding Requirements\n\n" +
    "Every finding MUST include:\n" +
    "1. **criterionId** — The exact criterion ID (AUTH-C1 through AUTH-C10) this finding relates to.\n" +
    "2. **evidence** — At least one evidence entry with the exact file path, line number, " +
    "and code snippet from the provided context. Never fabricate evidence.\n" +
    "3. **risk** — A clear description of the security risk this introduces.\n" +
    "4. **remediation** — A concrete, implementable fix (not generic advice).\n\n" +

    "### Verdict Assignment Rules\n\n" +
    "- Report each distinct issue as a separate finding.\n" +
    "- A single criterion can have multiple findings if multiple issues exist.\n" +
    "- If a criterion is not applicable to the changed code (e.g., no password reset " +
    "flow exists in the PR), do not report it as a finding — note its absence in the summary.\n" +
    "- If a criterion cannot be fully evaluated because required context (middleware, " +
    "configuration, dependency code) is missing, use NOT_VERIFIED rather than making assumptions.\n" +
    "- Never infer vulnerabilities without sufficient code evidence. If you suspect an issue " +
    "but lack evidence, flag it as NOT_VERIFIED with an explanation, not as FAIL.\n\n" +

    "### Analysis Priorities\n\n" +
    "- Prioritize findings by exploitability: critical > warning > info.\n" +
    "- Authentication bypass (AUTH-C4) and password storage (AUTH-C1) issues are almost " +
    "always critical severity.\n" +
    "- Information disclosure (AUTH-C10) issues are typically warning severity unless they " +
    "enable direct account enumeration at scale.\n" +
    "- Missing best practices that have mitigating controls are typically info severity.",
};
