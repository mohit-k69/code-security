import type { ReviewSpecification } from "./ReviewSpecification.ts";

export const CryptographySpec: ReviewSpecification = {
  id: "SEC-CRYPTO-001",
  name: "Cryptography Security Review",
  version: "1.0",
  category: "cryptography",

  description:
    "Determines whether sensitive data is protected using modern cryptographic " +
    "practices throughout the application. Evaluates encryption algorithms, " +
    "password hashing, key management, random number generation, data integrity, " +
    "and deprecation.",

  criteria: [
    // ────────────────────────────────────────────────────────────────
    // C1 — Secure Encryption Algorithms
    // ────────────────────────────────────────────────────────────────
    {
      id: "CRYPTO-C1",
      name: "Secure Encryption Algorithms",
      description:
        "The application must use modern, approved encryption algorithms (e.g., AES) " +
        "for data confidentiality. It must avoid weak, broken, or deprecated algorithms " +
        "(e.g., DES, 3DES, RC4).\n\n" +
        "PASS: Modern algorithms (like AES-256) are used for encryption.\n" +
        "FAIL: The application relies on deprecated or broken algorithms (DES, RC4) " +
        "for encryption.\n" +
        "NOT_VERIFIED: Encryption algorithms are not explicitly defined in the context, " +
        "or are managed completely by an external API (like AWS KMS) without visibility " +
        "into the specific algorithm used.",
    },

    // ────────────────────────────────────────────────────────────────
    // C2 — Secure Password Hashing
    // ────────────────────────────────────────────────────────────────
    {
      id: "CRYPTO-C2",
      name: "Secure Password Hashing",
      description:
        "Passwords must be protected using modern, purposely-designed password hashing " +
        "algorithms (e.g., Argon2, bcrypt, scrypt, PBKDF2) with an adequate work factor. " +
        "General-purpose hashing algorithms (e.g., MD5, SHA-1, SHA-256, SHA-512) are " +
        "too fast and must NOT be used for passwords.\n\n" +
        "PASS: Passwords are hashed using bcrypt, Argon2, or PBKDF2 with salt.\n" +
        "FAIL: Passwords are hashed using MD5, SHA-256, or stored in plaintext.\n" +
        "NOT_VERIFIED: Password hashing is managed by an external identity provider " +
        "(e.g., Firebase Auth) and is not visible in the code context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C3 — Key Management
    // ────────────────────────────────────────────────────────────────
    {
      id: "CRYPTO-C3",
      name: "Key Management",
      description:
        "Encryption keys must be securely generated, stored, loaded, and used. " +
        "Keys must be fetched securely at runtime from environment variables or a KMS.\n\n" +
        "PASS: Keys are fetched securely at runtime from environment variables or a " +
        "key management service (KMS).\n" +
        "NOT_VERIFIED: Key generation/storage occurs entirely in an external vault system " +
        "outside the context. Hardcoded secrets MUST NOT be evaluated here.",
    },

    // ────────────────────────────────────────────────────────────────
    // C4 — Random Number Generation
    // ────────────────────────────────────────────────────────────────
    {
      id: "CRYPTO-C4",
      name: "Random Number Generation",
      description:
        "Security-sensitive values (such as encryption keys, session identifiers, " +
        "password reset tokens, nonces, and salts) must use cryptographically secure " +
        "random number generators (CSPRNG).\n\n" +
        "PASS: The application uses `crypto.randomBytes()`, `window.crypto.getRandomValues()`, " +
        "or equivalent secure functions for secrets.\n" +
        "FAIL: Weak pseudo-random number generators (PRNGs) like `Math.random()` or " +
        "`Date.now()` are used to generate security-sensitive tokens.\n" +
        "NOT_VERIFIED: Randomness generation is abstracted away inside an external library " +
        "or service not present in the context.",
    },

    // ────────────────────────────────────────────────────────────────
    // C5 — Data Integrity Verification
    // ────────────────────────────────────────────────────────────────
    {
      id: "CRYPTO-C5",
      name: "Data Integrity Verification",
      description:
        "Cryptographic integrity protection must be implemented where appropriate. " +
        "This includes using digital signatures, HMACs, or Authenticated Encryption " +
        "(e.g., AES-GCM) to ensure data has not been tampered with. Do not assume data " +
        "integrity simply because it is encrypted.\n\n" +
        "PASS: Data is protected using authenticated encryption (e.g., `aes-256-gcm`) " +
        "or HMACs are verified before processing.\n" +
        "FAIL: Using unauthenticated encryption modes (like CBC or CTR without HMAC) " +
        "which are vulnerable to padding oracle or bit-flipping attacks, or accepting " +
        "data without verifying its signature.\n" +
        "NOT_VERIFIED: Integrity checks happen implicitly over a secure transport layer " +
        "(like TLS) where payload-level integrity isn't manually verified in the code.",
    },

    // ────────────────────────────────────────────────────────────────
    // C6 — Deprecated or Insecure Cryptography
    // ────────────────────────────────────────────────────────────────
    {
      id: "CRYPTO-C6",
      name: "Deprecated or Insecure Cryptography",
      description:
        "The application must avoid insecure cryptographic practices. This includes " +
        "using deprecated hash functions (MD5, SHA-1), insecure cipher modes (like ECB, " +
        "which leaks patterns), disabling TLS certificate validation, or implementing " +
        "custom 'roll-your-own' cryptography.\n\n" +
        "PASS: The application strictly enforces modern TLS, uses strong algorithms, " +
        "and relies on vetted standard cryptographic libraries.\n" +
        "FAIL: The application uses MD5, SHA-1, ECB mode, intentionally disables TLS " +
        "certificate validation (e.g., `rejectUnauthorized: false`), or implements " +
        "custom cryptographic math.\n" +
        "NOT_VERIFIED: Transport security (TLS) is terminated at a load balancer not " +
        "visible in the application code.",
    },
  ],

  promptInstruction:
    "Focus your analysis on the changed files. For each criterion, determine " +
    "whether the code introduces, modifies, or fails to address the cryptographic concern.\n\n" +

    "### Finding Requirements\n\n" +
    "Every finding MUST include:\n" +
    "1. **criterionId** — The exact criterion ID (CRYPTO-C1 through CRYPTO-C6) this finding relates to.\n" +
    "2. **evidence** — At least one evidence entry with the exact file path, line number, " +
    "and code snippet from the provided context. Never fabricate evidence.\n" +
    "3. **risk** — A clear description of the security risk (e.g., 'SHA-256 is a fast " +
    "hash function that allows attackers to crack passwords offline rapidly').\n" +
    "4. **remediation** — A concrete, implementable fix (e.g., 'Replace SHA-256 with " +
    "bcrypt using a work factor of at least 10').\n\n" +

    "### NON-SECURITY HASHING EXCEPTION (CRITICAL)\n\n" +
    "- Do NOT flag MD5 or SHA-1 when the code clearly uses them for non-security purposes such as HTTP ETags, cache keys, object/content identifiers, or non-security checksums.\n" +
    "- The exception applies only when the surrounding code clearly establishes that cryptographic integrity, authenticity, password protection, signature security, or security-sensitive collision resistance is NOT required.\n" +
    "- Do NOT suppress a finding merely because a variable is named 'checksum', 'etag', or similar if the surrounding logic is security-sensitive.\n\n" +

    "### Analysis Priorities\n\n" +
    "- Using general-purpose or deprecated hash functions (like MD5 or SHA-1) for passwords (CRYPTO-C2) is **critical** severity.\n" +
    "- Using weak or deprecated encryption algorithms (e.g., DES, 3DES, RC4) for encryption (CRYPTO-C1) is **critical** severity.\n\n" +

    "### Verdict Assignment Rules\n\n" +
    "- Report each distinct issue as a separate finding.\n" +
    "- If general-purpose hashing (MD5, SHA-1, SHA-256, SHA-512) is used to hash a " +
    "password, this is a **FAIL** under CRYPTO-C2.\n" +
    "- Using `Math.random()` for any sensitive value (tokens, keys, IDs) is a **FAIL** " +
    "under CRYPTO-C4.\n" +
    "- **CRITICAL**: Do NOT flag hardcoded encryption keys, JWT secrets, or API keys here. Hardcoded secrets are strictly evaluated by SEC-SECRET-001.\n" +
    "- **CRITICAL**: Do NOT flag a database query (e.g., `WHERE password = $1`) as a cryptography/hashing failure unless there is explicit evidence of storing a plaintext password or explicit missing hashing. If it's just a variable binding, return NOT_VERIFIED or PASS.\n" +
    "- Using ECB mode (e.g., `aes-128-ecb`) is a **FAIL** under CRYPTO-C6.\n" +
    "- Never infer cryptographic weaknesses without sufficient code evidence.",
};
