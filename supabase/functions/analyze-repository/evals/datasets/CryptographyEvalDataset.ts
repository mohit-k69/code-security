import type { EvalDataset } from "../types.ts";

export const CryptographyEvalDataset: EvalDataset = {
  checkpointId: "SEC-CRYPTO-001",
  version: "1.0",
  scenarios: [
    // ═══════════════════════════════════════════════════════════════════
    // CRYPTO-C1: Secure Encryption Algorithms
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CRYPTO-FAIL-01",
      description: "Using deprecated DES algorithm for encryption",
      tags: ["encryption", "algorithm", "deprecated", "des"],
      criteriaTargeted: ["CRYPTO-C1"],
      changedFiles: [
        {
          path: "src/utils/crypto.ts",
          content: `
import crypto from 'crypto';

export function encryptData(text, key) {
  // DES is broken and easily cracked
  const cipher = crypto.createCipher('des', key);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C1",
          expectedEvidence: [{ file: "src/utils/crypto.ts", snippetSubstr: "crypto.createCipher('des'" }]
        }
      ],
      rationale: "DES (Data Encryption Standard) is computationally broken and must be replaced with modern algorithms like AES."
    },
    {
      id: "CRYPTO-FAIL-02",
      description: "Using RC4 stream cipher",
      tags: ["encryption", "algorithm", "rc4"],
      criteriaTargeted: ["CRYPTO-C1"],
      changedFiles: [
        {
          path: "src/utils/stream.ts",
          content: `
import crypto from 'crypto';

export function encryptStream(key) {
  // RC4 is heavily vulnerable and deprecated
  return crypto.createCipher('rc4', key);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C1",
          expectedEvidence: [{ file: "src/utils/stream.ts", snippetSubstr: "crypto.createCipher('rc4'" }]
        }
      ],
      rationale: "RC4 is a broken stream cipher with numerous known vulnerabilities and biases."
    },
    {
      id: "CRYPTO-PASS-01",
      description: "Using modern AES-256 for encryption",
      tags: ["secure", "encryption", "aes256"],
      criteriaTargeted: ["CRYPTO-C1"],
      changedFiles: [
        {
          path: "src/utils/crypto.ts",
          content: `
import crypto from 'crypto';

export function encryptData(text, key, iv) {
  // AES-256 is an approved, modern standard
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "AES-256 is a robust, industry-standard encryption algorithm."
    },

    // ═══════════════════════════════════════════════════════════════════
    // CRYPTO-C2: Secure Password Hashing
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CRYPTO-FAIL-03",
      description: "Hashing passwords with fast general-purpose hash (SHA-256)",
      tags: ["password", "hashing", "sha256"],
      criteriaTargeted: ["CRYPTO-C2"],
      changedFiles: [
        {
          path: "src/auth/register.ts",
          content: `
import crypto from 'crypto';

export async function register(user, password) {
  // SHA-256 is too fast for password hashing, vulnerable to brute force
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  await db.createUser(user, hash);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C2",
          expectedEvidence: [{ file: "src/auth/register.ts", snippetSubstr: "crypto.createHash('sha256')" }]
        }
      ],
      rationale: "SHA-256 is designed to be fast, making it unsuitable for passwords. Attackers can brute-force billions of hashes per second."
    },
    {
      id: "CRYPTO-FAIL-04",
      description: "Hashing passwords with deprecated MD5",
      tags: ["password", "hashing", "md5", "deprecated"],
      criteriaTargeted: ["CRYPTO-C2", "CRYPTO-C6"],
      changedFiles: [
        {
          path: "src/auth/register.ts",
          content: `
import crypto from 'crypto';

export async function register(user, password) {
  // MD5 is entirely broken and vulnerable to collisions and rapid cracking
  const hash = crypto.createHash('md5').update(password).digest('hex');
  await db.createUser(user, hash);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C2",
          expectedEvidence: [{ file: "src/auth/register.ts", snippetSubstr: "crypto.createHash('md5')" }]
        }
      ],
      rationale: "MD5 is completely broken for any security purpose, especially password hashing."
    },
    {
      id: "CRYPTO-PASS-02",
      description: "Secure password hashing with bcrypt",
      tags: ["secure", "password", "hashing", "bcrypt"],
      criteriaTargeted: ["CRYPTO-C2"],
      changedFiles: [
        {
          path: "src/auth/register.ts",
          content: `
import bcrypt from 'bcrypt';

export async function register(user, password) {
  // bcrypt is designed for passwords and includes built-in salting and work factors
  const saltRounds = 12;
  const hash = await bcrypt.hash(password, saltRounds);
  await db.createUser(user, hash);
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "bcrypt with a sufficient work factor (12) is an industry standard for password storage."
    },

    // ═══════════════════════════════════════════════════════════════════
    // CRYPTO-C3: Key Management
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CRYPTO-FAIL-05",
      description: "Hardcoded encryption key in source code",
      tags: ["key-management", "hardcoded", "secrets"],
      criteriaTargeted: ["CRYPTO-C3"],
      changedFiles: [
        {
          path: "src/utils/crypto.ts",
          content: `
import crypto from 'crypto';

// Never hardcode keys in the source file!
const MASTER_KEY = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');

export function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', MASTER_KEY, iv);
  // ...
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C3",
          expectedEvidence: [{ file: "src/utils/crypto.ts", snippetSubstr: "const MASTER_KEY =" }] // Value must be redacted in real output
        }
      ],
      rationale: "Encryption keys must never be hardcoded. They should be fetched securely at runtime from environment variables or a KMS."
    },
    {
      id: "CRYPTO-FAIL-06",
      description: "Reusing the same Initialization Vector (IV)",
      tags: ["key-management", "iv", "reuse"],
      criteriaTargeted: ["CRYPTO-C3", "CRYPTO-C6"],
      changedFiles: [
        {
          path: "src/utils/crypto.ts",
          content: `
import crypto from 'crypto';

// Hardcoding or reusing IVs destroys the security of the cipher mode
const STATIC_IV = Buffer.alloc(16, 0); 

export function encrypt(text, key) {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, STATIC_IV);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C3",
          expectedEvidence: [{ file: "src/utils/crypto.ts", snippetSubstr: "const STATIC_IV = Buffer.alloc(16, 0);" }]
        }
      ],
      rationale: "Initialization Vectors (IVs) must be unique and unpredictable for every encryption operation."
    },
    {
      id: "CRYPTO-PASS-03",
      description: "Secure key generation and unique IVs",
      tags: ["secure", "key-management", "iv", "csprng"],
      criteriaTargeted: ["CRYPTO-C3"],
      changedFiles: [
        {
          path: "src/utils/crypto.ts",
          content: `
import crypto from 'crypto';

// Key is securely fetched, not hardcoded
const getKey = () => Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

export function encrypt(text) {
  // A fresh, secure IV is generated for every encryption
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  // ...
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Keys are securely loaded from the environment, and a fresh IV is generated per operation using a CSPRNG."
    },
    {
      id: "CRYPTO-PASS-04",
      description: "Key rotation implementation (Enhancement)",
      tags: ["secure", "key-management", "rotation"],
      criteriaTargeted: ["CRYPTO-C3"],
      changedFiles: [
        {
          path: "src/utils/crypto.ts",
          content: `
import crypto from 'crypto';
import { getKeysFromKms } from './kms';

export async function decryptData(encryptedPayload) {
  const { version, iv, ciphertext, tag } = JSON.parse(encryptedPayload);
  
  // Supports key rotation by fetching the specific key version used to encrypt
  const keys = await getKeysFromKms();
  const key = keys.find(k => k.version === version);
  if (!key) throw new Error("Key version expired or invalid");
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key.material, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  // ...
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "The application properly implements key rotation by storing and referencing key versions alongside ciphertext."
    },

    // ═══════════════════════════════════════════════════════════════════
    // CRYPTO-C4: Random Number Generation
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CRYPTO-FAIL-07",
      description: "Using Math.random() for API tokens",
      tags: ["prng", "math-random", "tokens"],
      criteriaTargeted: ["CRYPTO-C4"],
      changedFiles: [
        {
          path: "src/api/tokens.ts",
          content: `
export function generateApiToken() {
  // Math.random() is NOT cryptographically secure
  return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C4",
          expectedEvidence: [{ file: "src/api/tokens.ts", snippetSubstr: "Math.random()" }]
        }
      ],
      rationale: "Math.random() generates predictable values. Attackers can predict future tokens if they observe enough outputs."
    },
    {
      id: "CRYPTO-FAIL-08",
      description: "Using timestamp for password reset token",
      tags: ["prng", "predictable", "reset-token"],
      criteriaTargeted: ["CRYPTO-C4"],
      changedFiles: [
        {
          path: "src/auth/reset.ts",
          content: `
export function createResetToken(userId) {
  // Time-based tokens are highly predictable
  const token = \`reset-\${userId}-\${Date.now()}\`;
  db.saveResetToken(userId, token);
  return token;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C4",
          expectedEvidence: [{ file: "src/auth/reset.ts", snippetSubstr: "Date.now()" }]
        }
      ],
      rationale: "Using Date.now() provides almost zero entropy. An attacker can easily guess the token generated for a user."
    },
    {
      id: "CRYPTO-PASS-05",
      description: "Using crypto.randomBytes for password reset",
      tags: ["secure", "csprng", "reset-token"],
      criteriaTargeted: ["CRYPTO-C4"],
      changedFiles: [
        {
          path: "src/auth/reset.ts",
          content: `
import crypto from 'crypto';

export function createResetToken(userId) {
  // High entropy CSPRNG
  const token = crypto.randomBytes(32).toString('hex');
  db.saveResetToken(userId, token);
  return token;
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "crypto.randomBytes() is cryptographically secure and produces unpredictable tokens."
    },

    // ═══════════════════════════════════════════════════════════════════
    // CRYPTO-C5: Data Integrity Verification
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CRYPTO-FAIL-09",
      description: "Encryption without integrity (AES-CBC)",
      tags: ["integrity", "aes-cbc", "padding-oracle"],
      criteriaTargeted: ["CRYPTO-C5"],
      changedFiles: [
        {
          path: "src/utils/crypto.ts",
          content: `
import crypto from 'crypto';

export function decryptData(encryptedHex, key, iv) {
  // Uses CBC mode without an HMAC to verify integrity
  // Vulnerable to bit-flipping and padding oracle attacks
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C5",
          expectedEvidence: [{ file: "src/utils/crypto.ts", snippetSubstr: "crypto.createDecipheriv('aes-256-cbc'" }]
        }
      ],
      rationale: "Unauthenticated encryption modes like CBC provide confidentiality but NOT integrity. An attacker can modify the ciphertext."
    },
    {
      id: "CRYPTO-FAIL-10",
      description: "Timing attack vulnerability in HMAC comparison",
      tags: ["integrity", "hmac", "timing-attack"],
      criteriaTargeted: ["CRYPTO-C5"],
      changedFiles: [
        {
          path: "src/webhooks/verify.ts",
          content: `
import crypto from 'crypto';

export function verifyWebhook(payload, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  // Simple string comparison is vulnerable to timing attacks
  return signature === expected;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C5",
          expectedEvidence: [{ file: "src/webhooks/verify.ts", snippetSubstr: "return signature === expected;" }]
        }
      ],
      rationale: "String comparison operators short-circuit, allowing attackers to guess HMAC signatures byte-by-byte via timing attacks. Use crypto.timingSafeEqual()."
    },
    {
      id: "CRYPTO-PASS-06",
      description: "Authenticated encryption using AES-GCM",
      tags: ["secure", "integrity", "aes-gcm", "aead"],
      criteriaTargeted: ["CRYPTO-C5"],
      changedFiles: [
        {
          path: "src/utils/crypto.ts",
          content: `
import crypto from 'crypto';

export function decryptData(encryptedHex, key, iv, authTagHex) {
  // GCM is Authenticated Encryption with Associated Data (AEAD)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  // If the auth tag is invalid, final() will throw an error automatically
  return decrypted;
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "AES-GCM securely provides both confidentiality and integrity simultaneously."
    },

    // ═══════════════════════════════════════════════════════════════════
    // CRYPTO-C6: Deprecated or Insecure Cryptography
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CRYPTO-FAIL-11",
      description: "Disabling TLS certificate validation",
      tags: ["insecure-practice", "tls", "reject-unauthorized"],
      criteriaTargeted: ["CRYPTO-C6"],
      changedFiles: [
        {
          path: "src/services/api.ts",
          content: `
import https from 'https';

export function fetchSensitiveData() {
  const agent = new https.Agent({
    // CRITICAL: Disables certificate validation, vulnerable to MITM
    rejectUnauthorized: false
  });
  
  return fetch('https://api.internal.com/data', { agent });
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C6",
          expectedEvidence: [{ file: "src/services/api.ts", snippetSubstr: "rejectUnauthorized: false" }]
        }
      ],
      rationale: "Disabling TLS validation (rejectUnauthorized: false) allows Man-In-The-Middle (MITM) attackers to intercept and decrypt traffic."
    },
    {
      id: "CRYPTO-FAIL-12",
      description: "Using insecure ECB cipher mode",
      tags: ["insecure-practice", "ecb-mode", "encryption"],
      criteriaTargeted: ["CRYPTO-C6"],
      changedFiles: [
        {
          path: "src/utils/crypto.ts",
          content: `
import crypto from 'crypto';

export function encryptFast(text, key) {
  // ECB mode encrypts identical plaintext blocks to identical ciphertext blocks
  const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}
`.trim()
        }
      ],
      expectedVerdict: "FAIL",
      expectedFindings: [
        {
          criterionId: "CRYPTO-C6",
          expectedEvidence: [{ file: "src/utils/crypto.ts", snippetSubstr: "aes-256-ecb" }]
        }
      ],
      rationale: "Electronic Codebook (ECB) mode leaks data patterns (e.g., the ECB Penguin) and must never be used."
    },
    {
      id: "CRYPTO-PASS-07",
      description: "mTLS configuration correctly enforcing client certs (Enhancement)",
      tags: ["secure", "mtls", "tls"],
      criteriaTargeted: ["CRYPTO-C6"],
      changedFiles: [
        {
          path: "src/server.ts",
          content: `
import https from 'https';
import fs from 'fs';

const options = {
  key: fs.readFileSync('server-key.pem'),
  cert: fs.readFileSync('server-crt.pem'),
  ca: fs.readFileSync('ca-crt.pem'),
  requestCert: true,
  rejectUnauthorized: true // Securely enforcing mTLS
};

https.createServer(options, app).listen(443);
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Properly implements mutual TLS (mTLS) with strict certificate validation enabled."
    },
    {
      id: "CRYPTO-NV-01",
      description: "TLS termination handled by external load balancer",
      tags: ["missing-context", "tls", "load-balancer"],
      criteriaTargeted: ["CRYPTO-C6"],
      changedFiles: [
        {
          path: "src/server.ts",
          content: `
import http from 'http';
// Express app binds to HTTP on port 8080.
// In AWS, the ALB handles HTTPS/TLS and forwards traffic to this port.
http.createServer(app).listen(8080);
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "TLS is likely handled externally. Without the infrastructure configuration, we cannot verify the TLS settings."
    },

    // ═══════════════════════════════════════════════════════════════════
    // Cross-Cutting Scenarios
    // ═══════════════════════════════════════════════════════════════════
    {
      id: "CRYPTO-PASS-08",
      description: "Perfect cryptographic implementation",
      tags: ["comprehensive", "secure"],
      criteriaTargeted: ["CRYPTO-C1", "CRYPTO-C3", "CRYPTO-C4", "CRYPTO-C5"],
      changedFiles: [
        {
          path: "src/utils/crypto.ts",
          content: `
import crypto from 'crypto';

export function encryptPayload(data, keyBuffer) {
  const iv = crypto.randomBytes(12); // CSPRNG for GCM IV
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return { iv: iv.toString('hex'), encrypted, authTag };
}
`.trim()
        }
      ],
      expectedVerdict: "PASS",
      rationale: "Uses AES-GCM (C1, C5) with a securely generated IV (C4) and expects the key to be provided dynamically (C3)."
    },
    {
      id: "CRYPTO-NV-02",
      description: "PR modifies generic text utilities",
      tags: ["unrelated", "utils"],
      criteriaTargeted: [],
      changedFiles: [
        {
          path: "src/utils/text.ts",
          content: `
export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
`.trim()
        }
      ],
      expectedVerdict: "NOT_VERIFIED",
      rationale: "No cryptographic operations are present."
    }
  ]
};
