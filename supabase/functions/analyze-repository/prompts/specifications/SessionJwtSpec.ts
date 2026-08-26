import type { ReviewSpecification } from "./ReviewSpecification.ts";

export const SessionJwtSpec: ReviewSpecification = {
  id: "SEC-SESSION-001",
  name: "Session & JWT Security Review",
  version: "1.0",
  category: "session-management",

  description:
    "Determines whether authenticated sessions, cookies, JWTs, refresh tokens, and " +
    "authentication state are securely created, maintained, validated, renewed, " +
    "and destroyed throughout their lifecycle.",

  criteria: [
    // ────────────────────────────────────────────────────────────────
    // C1 — Secure Session Creation
    // ────────────────────────────────────────────────────────────────
    {
      id: "SESSION-C1",
      name: "Secure Session Creation",
      description:
        "Sessions and authentication tokens must be securely created after successful " +
        "authentication using cryptographically secure random generators or robust " +
        "signing algorithms (e.g., RS256, HS256).\n\n" +
        "PASS: Session IDs are generated securely (e.g., using robust libraries) and " +
        "JWTs are signed using secure algorithms (HS256, RS256).\n" +
        "FAIL: Session IDs are predictable (e.g., sequential IDs, weak PRNGs like " +
        "Math.random()), or JWTs are signed with 'none' algorithm or weak hashing.\n" +
        "NOT_VERIFIED: Token/Session creation logic is handled by external identity " +
        "providers or middleware not visible in the context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C2 — JWT Validation
    // ────────────────────────────────────────────────────────────────
    {
      id: "SESSION-C2",
      name: "JWT Validation",
      description:
        "JWTs must be properly validated before trust. This includes explicitly verifying " +
        "the signature, expiration, issuer, audience, and algorithm. Using `jwt.decode()` " +
        "instead of `jwt.verify()` for authentication trust is a critical vulnerability.\n\n" +
        "PASS: JWTs are explicitly verified using robust libraries (e.g., jsonwebtoken's " +
        "`verify()` method), checking the signature and throwing errors on invalid tokens. " +
        "Explicitly specifying secure algorithms (e.g., `algorithms: ['HS256']`) inherently rejects 'none'.\n" +
        "FAIL: The application trusts `jwt.decode()` without verifying the signature, " +
        "accepts the 'none' algorithm, ignores the expiration date, or fails to verify " +
        "critical claims (issuer/audience) when required. Do not fail if 'none' is rejected implicitly by an explicit algorithm list.\n" +
        "NOT_VERIFIED: JWT verification is handled by an API Gateway or framework layer " +
        "not provided in the context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C3 — Session & Token Expiration
    // ────────────────────────────────────────────────────────────────
    {
      id: "SESSION-C3",
      name: "Session & Token Expiration",
      description:
        "Sessions and tokens must expire appropriately and cannot be used indefinitely. " +
        "Access tokens (JWTs) should have short lifetimes, and stateful sessions should " +
        "enforce absolute and/or idle timeouts.\n\n" +
        "PASS: Access tokens are created with short expiration times (e.g., '15m'), " +
        "and session configurations define explicit timeouts.\n" +
        "FAIL: Access tokens are explicitly configured to never expire, sessions explicitly disable timeout mechanisms, or a JWT signing operation (e.g., jwt.sign) omits the expiration option, causing it to default to a non-expiring token.\n" +
        "NOT_VERIFIED: Expiration policies are defined in an external Identity Provider, or the snippet lacks the token creation or signing context entirely.",
    },

    // ────────────────────────────────────────────────────────────────
    // C4 — Refresh Token Security
    // ────────────────────────────────────────────────────────────────
    {
      id: "SESSION-C4",
      name: "Refresh Token Security",
      description:
        "Refresh tokens must be securely generated, stored (hashed or encrypted in DB), " +
        "validated, rotated upon use, and revoked when appropriate.\n\n" +
        "PASS: Refresh tokens are validated against a backend database/cache before " +
        "issuing new access tokens, and ideally rotated (new refresh token issued) on use.\n" +
        "FAIL: Refresh tokens are blindly trusted (e.g., verifying a JWT signature only) " +
        "without checking a revocation list or database, allowing revoked tokens to " +
        "generate new access tokens forever.\n" +
        "NOT_VERIFIED: Refresh token logic is handled by external providers.",
    },

    // ────────────────────────────────────────────────────────────────
    // C5 — Secure Cookie Configuration
    // ────────────────────────────────────────────────────────────────
    {
      id: "SESSION-C5",
      name: "Secure Cookie Configuration",
      description:
        "Authentication cookies must use appropriate security protections: " +
        "`Secure` (HTTPS only), `HttpOnly` (inaccessible to JavaScript), and " +
        "`SameSite` (CSRF protection) where applicable.\n\n" +
        "PASS: Authentication/Session cookies explicitly set `HttpOnly: true`, " +
        "`Secure: true` (or strictly in production), and `SameSite` appropriately.\n" +
        "FAIL: Session cookies lack the `HttpOnly` flag (allowing XSS theft) or " +
        "lack the `Secure` flag (allowing interception over HTTP).\n" +
        "NOT_VERIFIED: Cookies are not used for authentication (e.g., Bearer tokens " +
        "are used exclusively) or cookie configuration is external.",
    },

    // ────────────────────────────────────────────────────────────────
    // C6 — Session Invalidation
    // ────────────────────────────────────────────────────────────────
    {
      id: "SESSION-C6",
      name: "Session Invalidation",
      description:
        "Sessions, JWTs, and refresh tokens must be properly invalidated after logout, " +
        "password reset, credential change, or account disablement.\n\n" +
        "PASS: The logout endpoint destroys the session cookie and revokes the refresh " +
        "token in the database. Password resets revoke all active sessions.\n" +
        "FAIL: Logout merely deletes a client-side token without backend revocation, or " +
        "password resets fail to invalidate existing active refresh tokens/sessions.\n" +
        "NOT_VERIFIED: Logout and session invalidation logic is managed externally.",
    },
  ],

  promptInstruction:
    "Focus your analysis on the changed files. For each criterion, determine " +
    "whether the code introduces, modifies, or fails to address the session/JWT concern.\n\n" +

    "### Finding Requirements\n\n" +
    "Every finding MUST include:\n" +
    "1. **criterionId** — The exact criterion ID (SESSION-C1 through SESSION-C6) this finding relates to.\n" +
    "2. **evidence** — At least one evidence entry with the exact file path, line number, " +
    "and code snippet from the provided context. Never fabricate evidence.\n" +
    "3. **risk** — A clear description of the security risk (e.g., 'Using jwt.decode instead " +
    "of verify allows attackers to forge tokens and bypass authentication').\n" +
    "4. **remediation** — A concrete, implementable fix.\n\n" +

    "### Verdict Assignment Rules\n\n" +
    "- Report each distinct issue as a separate finding.\n" +
    "- If cookies are not used for authentication (e.g., Bearer tokens are used in headers), " +
    "return NOT_VERIFIED for SESSION-C5 (Secure Cookie Configuration).\n" +
    "- Using `jwt.decode()` for authentication trust (SESSION-C2) is a **FAIL**.\n" +
    "- Missing `HttpOnly` on auth cookies (SESSION-C5) is a **FAIL**.\n" +
    "- Logging out by only deleting a client-side cookie without invalidating the refresh " +
    "token backend state (SESSION-C6) is a **FAIL**.\n" +
    "- Treat `process.env.JWT_SECRET` or equivalent runtime secret retrieval as secure by default.\n" +
    "- **CRITICAL**: Do NOT flag hardcoded JWT secrets or keys here. Secret exposure is strictly evaluated by SEC-SECRET-001.\n" +
    "- Never infer vulnerabilities without sufficient code evidence.\n\n" +

    "### Analysis Priorities\n\n" +
    "- Authentication/authorization or impersonation bypasses caused by missing credential verification MUST be mapped to the `AUTH_BYPASS` vulnerability class.\n" +
    "- JWT-specific issues such as missing expiration, weak signing configuration, or JWT validation problems MUST be mapped to the `JWT_SECURITY` vulnerability class.",
};
