// ─── Authentication Security Checkpoint ──────────────────────────
// SEC-AUTH-001 — Authentication Review v1.0
//
// Evaluates authentication implementations for security vulnerabilities
// across credential handling, session management, and access control flows.

import type { ReviewSpecification } from "./ReviewSpecification.ts";

export const AuthenticationSpec: ReviewSpecification = {
  id: "SEC-AUTH-001",
  name: "Authentication Review",
  version: "1.0",
  category: "authentication",

  description:
    "Evaluates the authentication implementation for vulnerabilities in credential handling, " +
    "password storage, session management, multi-factor authentication, and brute-force protection. " +
    "Covers login, logout, password reset, and token-based authentication flows.",

  criteria: [
    {
      id: "AUTH-C1",
      name: "Password Storage",
      description:
        "Passwords must never be stored or compared in plaintext. " +
        "Use adaptive hashing algorithms (bcrypt, scrypt, Argon2) with sufficient work factors. " +
        "Reject MD5 and SHA-family hashes for password storage.",
    },
    {
      id: "AUTH-C2",
      name: "Credential Transmission",
      description:
        "Credentials must only be transmitted over encrypted channels (HTTPS/TLS). " +
        "Passwords must never appear in URLs, query parameters, or application logs.",
    },
    {
      id: "AUTH-C3",
      name: "Brute-Force Protection",
      description:
        "Authentication endpoints must implement rate limiting or account lockout mechanisms " +
        "to prevent brute-force and credential stuffing attacks.",
    },
    {
      id: "AUTH-C4",
      name: "Session Management",
      description:
        "Sessions must be regenerated after successful authentication to prevent session fixation. " +
        "Session tokens must be cryptographically random, sufficiently long, and transmitted securely " +
        "(HttpOnly, Secure, SameSite flags on cookies).",
    },
    {
      id: "AUTH-C5",
      name: "Authentication Bypass",
      description:
        "Verify that no code paths allow authentication to be bypassed. " +
        "Check for missing authentication middleware on protected routes, " +
        "default credentials, debug backdoors, and logic flaws in conditional checks.",
    },
    {
      id: "AUTH-C6",
      name: "Token Security",
      description:
        "If JWT or other tokens are used: verify signature validation is enforced, " +
        "tokens have reasonable expiration times, the 'none' algorithm is rejected, " +
        "and secrets are not hardcoded or weak.",
    },
    {
      id: "AUTH-C7",
      name: "Password Reset Flow",
      description:
        "Password reset tokens must be single-use, time-limited, and cryptographically random. " +
        "The reset flow must not reveal whether an account exists (no user enumeration).",
    },
    {
      id: "AUTH-C8",
      name: "Error Handling",
      description:
        "Authentication errors must return generic messages that do not distinguish between " +
        "invalid usernames and invalid passwords. Stack traces and internal details must never " +
        "be exposed to the client.",
    },
  ],

  promptInstruction:
    "Focus your analysis on the changed files. For each criterion, determine whether the code " +
    "introduces, modifies, or fails to address the security concern.\n\n" +
    "Report each distinct issue as a separate finding with evidence pointing to the exact file and line.\n\n" +
    "If a criterion is not applicable to the changed code (e.g., no password reset flow exists in the PR), " +
    "do not report it as a finding — simply note it in the summary.\n\n" +
    "If a criterion cannot be fully evaluated because required context (middleware, configuration, " +
    "dependency code) is missing, use NOT_VERIFIED as the verdict rather than making assumptions.",
};
