import type { ReviewSpecification } from "./ReviewSpecification.ts";

export const SecretsManagementSpec: ReviewSpecification = {
  id: "SEC-SECRET-001",
  name: "Secrets Management Review",
  version: "1.0",
  category: "secrets-management",

  description:
    "Determines whether secrets (API keys, passwords, access tokens, database " +
    "credentials, certificates, signing keys, encryption keys, and other sensitive " +
    "credentials) are stored, transmitted, loaded, rotated, and protected securely " +
    "throughout the application.",

  criteria: [
    // ────────────────────────────────────────────────────────────────
    // C1 — Hardcoded Secrets
    // ────────────────────────────────────────────────────────────────
    {
      id: "SECRET-C1",
      name: "Hardcoded Secrets",
      description:
        "Secrets must never be hardcoded in source code or committed to version control. " +
        "This includes API keys, access tokens, database passwords, JWT secrets, " +
        "encryption keys, certificates, private keys, and inadvertently committed " +
        "files like .env or service-account.json.\n\n" +
        "PASS: Secrets are referenced via environment variables or secret managers, " +
        "not hardcoded in the codebase.\n" +
        "FAIL: A secret value (or a file containing secrets, like a .env file) is " +
        "hardcoded or checked into the repository.\n" +
        "NOT_VERIFIED: Not applicable as this can usually be verified directly from the code.",
    },

    // ────────────────────────────────────────────────────────────────
    // C2 — Secure Secret Storage
    // ────────────────────────────────────────────────────────────────
    {
      id: "SECRET-C2",
      name: "Secure Secret Storage",
      description:
        "Secrets must be loaded from secure configuration mechanisms (e.g., environment " +
        "variables, AWS Secrets Manager, HashiCorp Vault, Azure Key Vault) rather than " +
        "insecure locations. Configuration files (JSON, YAML, XML) must not contain " +
        "plaintext secrets.\n\n" +
        "PASS: Secrets are injected into the application at runtime via secure environments " +
        "(e.g., `process.env.VAR`) or fetched securely via a secrets manager.\n" +
        "FAIL: Secrets are stored in plaintext configuration files, custom encrypted " +
        "files with hardcoded keys, or use explicitly insecure fallbacks (e.g., `process.env.SECRET || 'dev_secret'`).\n" +
        "NOT_VERIFIED: The mechanism by which the environment variables or configuration " +
        "files are populated is external to the provided context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C3 — Secret Exposure
    // ────────────────────────────────────────────────────────────────
    {
      id: "SECRET-C3",
      name: "Secret Exposure",
      description:
        "Secrets must never be exposed inadvertently to untrusted parties. They must " +
        "be excluded from application logs, error messages, API responses, client-side " +
        "code (e.g., React/Vue frontend bundles), and debug output.\n\n" +
        "PASS: Sensitive variables are explicitly masked or omitted before logging or " +
        "returning data to the client. Frontend code does not import backend secrets.\n" +
        "FAIL: Secrets are logged (e.g., console.log(process.env)), included in stack " +
        "traces, returned in API payloads (e.g., returning a full user object with " +
        "password hashes/tokens), or embedded in client-side JavaScript.\n" +
        "NOT_VERIFIED: Logging or response serialization mechanisms are managed globally " +
        "by frameworks not visible in the context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C4 — Secret Lifecycle
    // ────────────────────────────────────────────────────────────────
    {
      id: "SECRET-C4",
      name: "Secret Lifecycle",
      description:
        "Secrets should be handled safely throughout their lifecycle. Applications " +
        "should prefer temporary, short-lived credentials over long-lived static keys. " +
        "Tokens must have appropriate expiration times, and mechanisms should exist " +
        "to rotate or revoke compromised secrets.\n\n" +
        "PASS: The application uses short-lived tokens (e.g., JWTs with short expires), " +
        "assumes temporary roles (e.g., AWS STS), or implements mechanisms to rotate keys.\n" +
        "FAIL: The application relies entirely on long-lived, non-expiring tokens where " +
        "short-lived alternatives are supported, or hardcodes assumptions that prevent " +
        "secret rotation (e.g., immutable secret IDs).\n" +
        "NOT_VERIFIED: Secret lifecycle management (rotation schedules, token policies) " +
        "is handled by an external Identity Provider or Secrets Manager out of context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C5 — Least Privilege Credentials
    // ────────────────────────────────────────────────────────────────
    {
      id: "SECRET-C5",
      name: "Least Privilege Credentials",
      description:
        "Applications must use credentials that possess only the minimum permissions " +
        "necessary to perform their intended function. For example, an application " +
        "that only reads data should use a read-only database user or a read-only API token.\n\n" +
        "PASS: Credentials requested or used are scoped to specific, limited permissions " +
        "(e.g., specific scopes in an OAuth token, restricted DB roles).\n" +
        "FAIL: The application requests or uses highly privileged credentials (e.g., " +
        "root database users, full-access cloud IAM roles, unscoped API tokens) for " +
        "routine operations.\n" +
        "NOT_VERIFIED: The actual permissions assigned to the credentials are defined " +
        "in infrastructure-as-code or cloud consoles not visible in the provided files.",
    },

    // ────────────────────────────────────────────────────────────────
    // C6 — Secure Secret Usage
    // ────────────────────────────────────────────────────────────────
    {
      id: "SECRET-C6",
      name: "Secure Secret Usage",
      description:
        "Secrets must be used only where strictly necessary and must not be unnecessarily " +
        "copied, cached, serialized, or persisted to disk. Secrets should reside in " +
        "memory only for as long as they are actively needed.\n\n" +
        "PASS: Secrets are used directly for authentication/encryption and are not " +
        "assigned to long-lived global states, written to temporary files, or cached " +
        "insecurely.\n" +
        "FAIL: Secrets are written to disk (e.g., saving a token to a temp file for another " +
        "process), serialized into cache systems (e.g., Redis) in plaintext, or held " +
        "unnecessarily in global application state.\n" +
        "NOT_VERIFIED: The runtime memory management or caching infrastructure is external " +
        "to the provided context.",
    },
  ],

  promptInstruction:
    "Focus your analysis on the changed files. For each criterion, determine " +
    "whether the code introduces, modifies, or fails to address the secrets management concern.\n\n" +

    "### Finding Requirements\n\n" +
    "Every finding MUST include:\n" +
    "1. **criterionId** — The exact criterion ID (SECRET-C1 through SECRET-C6) this finding relates to.\n" +
    "2. **evidence** — At least one evidence entry with the exact file path, line number, " +
    "and code snippet from the provided context. Never fabricate evidence.\n" +
    "3. **risk** — A clear description of the security risk (e.g., 'Hardcoded API keys can " +
    "be extracted from version control and abused by attackers').\n" +
    "4. **remediation** — A concrete, implementable fix (e.g., 'Move the Stripe secret key " +
    "to an environment variable and access it via process.env.STRIPE_SECRET_KEY').\n\n" +

    "### THE REDACTION RULE (CRITICAL)\n\n" +
    "You MUST NEVER reveal actual secret values in your findings, risk explanations, " +
    "remediations, or evidence snippets.\n" +
    "- If you detect a hardcoded secret, describe its type ONLY (e.g., 'AWS Access Key', " +
    "'JWT Secret', 'Database Password').\n" +
    "- In the `evidence` snippet, you MUST redact the actual secret value. For example, " +
    "if the code is `const key = 'sk_live_12345';`, your evidence snippet MUST be " +
    "`const key = '***REDACTED***';` or `const key = 'sk_live_...'`.\n" +
    "- Failure to redact secrets constitutes a severe security violation of the review platform.\n\n" +

    "### Verdict Assignment Rules\n\n" +
    "- Report each distinct issue as a separate finding.\n" +
    "- A single criterion can have multiple findings if multiple issues exist.\n" +
    "- If a criterion cannot be fully evaluated because required context is missing, use " +
    "NOT_VERIFIED rather than assumptions.\n" +
    "- Never infer secret exposure without sufficient code evidence.\n\n" +

    "### Analysis Priorities\n\n" +
    "- Hardcoded secrets (SECRET-C1) and Secret Exposure via logs/APIs (SECRET-C3) are " +
    "almost always **critical** severity.\n" +
    "- Plaintext secrets in config files (SECRET-C2) are **critical** severity.\n" +
    "- Using overly privileged credentials (SECRET-C5) is typically **high** severity.\n" +
    "- Lack of secret rotation or relying on excessively long-lived tokens (SECRET-C4) " +
    "is typically a **moderate** or **warning** level finding.",
};
