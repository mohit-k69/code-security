/**
 * Secure One-Time Recovery Codes Module (Phase 1)
 *
 * Provides cryptographically secure generation, normalization, cryptographic hashing,
 * and database storage for one-time backup recovery codes.
 *
 * Security guarantees:
 * 1. Randomness: Generated using Web Crypto `crypto.getRandomValues()` with >= 128 bits of entropy per code.
 * 2. Unpredictability: Pure random entropy; zero reliance on user ID, email, password, or timestamps.
 * 3. Human-readability: Uses Crockford's Base32 alphabet (no confusing I/L/O/U) formatted with hyphens.
 * 4. Secure Storage: Plaintext codes are never stored, logged, or cached; only cryptographic SHA-256 hashes are persisted.
 * 5. Backend Boundary: Intended strictly for trusted server-side and Supabase Edge Function execution.
 */

// Crockford Base32 alphabet: 32 symbols, exactly 5 bits of entropy per character.
// Excludes 'I', 'L', 'O', and 'U' to eliminate visual ambiguity and accidental profanities.
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Minimum required entropy: 128 bits (16 bytes). Default: 160 bits (20 bytes = 32 Crockford symbols).
export const MIN_ENTROPY_BYTES = 16;
export const DEFAULT_ENTROPY_BYTES = 20;
export const RECOVERY_CODES_COUNT = 10;

/**
 * Normalizes a recovery code by stripping hyphens/whitespace, converting to uppercase,
 * and mapping common Crockford visual lookalikes ('O' -> '0', 'I'/'L' -> '1').
 */
export function normalizeRecoveryCode(rawCode: string): string {
  if (!rawCode || typeof rawCode !== 'string') {
    return '';
  }
  return rawCode
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/**
 * Generates a single human-readable recovery code containing at least 128 bits of randomness.
 *
 * @param entropyBytes Number of cryptographically secure random bytes (must be >= 16 bytes / 128 bits).
 * @returns Formatted recovery code string (e.g. "AB7K-29QD-XP4M-7T2N-K8VF-9W3Z-4M2P-7R6Y")
 */
export function generateRecoveryCode(entropyBytes: number = DEFAULT_ENTROPY_BYTES): string {
  if (entropyBytes < MIN_ENTROPY_BYTES) {
    throw new Error(
      `Recovery code entropy too low: requested ${entropyBytes} bytes (${entropyBytes * 8} bits), minimum required is ${MIN_ENTROPY_BYTES} bytes (128 bits)`
    );
  }

  // Ensure cryptographically secure PRNG
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('Cryptographically secure PRNG (crypto.getRandomValues) is not available in the current environment');
  }

  const randomBytes = new Uint8Array(entropyBytes);
  cryptoObj.getRandomValues(randomBytes);

  // Extract 5-bit chunks from random bytes to map uniformly to Crockford alphabet
  // Total bits available = entropyBytes * 8
  const totalBits = entropyBytes * 8;
  const numChars = Math.floor(totalBits / 5);
  let charArray: string[] = [];

  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;

  for (let i = 0; i < numChars; i++) {
    while (bitCount < 5 && byteIndex < entropyBytes) {
      bitBuffer = (bitBuffer << 8) | randomBytes[byteIndex++];
      bitCount += 8;
    }
    const shift = bitCount - 5;
    const index = (bitBuffer >> shift) & 0x1f; // 5-bit index (0..31)
    bitBuffer &= (1 << shift) - 1;
    bitCount -= 5;
    charArray.push(CROCKFORD_ALPHABET[index]);
  }

  // Format characters into human-readable 4-character chunks separated by hyphens
  const formattedChunks: string[] = [];
  for (let i = 0; i < charArray.length; i += 4) {
    formattedChunks.push(charArray.slice(i, i + 4).join(''));
  }

  return formattedChunks.join('-');
}

/**
 * Computes the cryptographic SHA-256 verifier hash of a normalized recovery code.
 *
 * @param code The plaintext recovery code (either formatted or unformatted)
 * @returns 64-character lowercase hexadecimal SHA-256 hash string
 */
export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) {
    throw new Error('Cannot hash empty recovery code');
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);

  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.digest === 'function') {
    const hashBuffer = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Server-side Node.js fallback
  try {
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(data).digest('hex');
  } catch (err) {
    throw new Error('No cryptographic SHA-256 implementation available');
  }
}

/**
 * Constant-time comparison to verify a plaintext code against a stored SHA-256 hash.
 */
export async function verifyRecoveryCodeHash(enteredCode: string, storedHash: string): Promise<boolean> {
  if (!enteredCode || !storedHash) return false;
  const computedHash = await hashRecoveryCode(enteredCode);
  if (computedHash.length !== storedHash.length) return false;

  let mismatch = 0;
  for (let i = 0; i < computedHash.length; i++) {
    mismatch |= computedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return mismatch === 0;
}

export interface GeneratedRecoveryCodeBatch {
  codes: string[];   // Plaintext codes returned strictly ONCE for user display/download
  hashes: string[];  // Corresponding SHA-256 verifier hashes for database persistence
}

/**
 * Generates exactly 10 independent, unique recovery codes along with their cryptographic hashes.
 */
export async function generateRecoveryCodeSet(
  count: number = RECOVERY_CODES_COUNT,
  entropyBytes: number = DEFAULT_ENTROPY_BYTES
): Promise<GeneratedRecoveryCodeBatch> {
  if (count !== RECOVERY_CODES_COUNT) {
    throw new Error(`Recovery code batch must contain exactly ${RECOVERY_CODES_COUNT} codes, received ${count}`);
  }

  const codes: string[] = [];
  const hashes: string[] = [];
  const seenCodes = new Set<string>();

  for (let i = 0; i < count; i++) {
    let code: string;
    let attempts = 0;

    // Guard against astronomically unlikely collisions
    do {
      code = generateRecoveryCode(entropyBytes);
      attempts++;
      if (attempts > 50) {
        throw new Error('Failed to generate unique recovery code batch');
      }
    } while (seenCodes.has(code));

    seenCodes.add(code);
    codes.push(code);

    const hash = await hashRecoveryCode(code);
    hashes.push(hash);
  }

  return { codes, hashes };
}

/**
 * Database operation: Marks all currently active (unconsumed and unrevoked) recovery codes
 * for a user as revoked (`revoked_at = now()`).
 *
 * Essential foundation for regeneration: whenever new codes are generated, previous codes
 * must be invalidated.
 */
export async function revokeActiveRecoveryCodes(supabaseAdmin: any, userId: string): Promise<number> {
  if (!userId) {
    throw new Error('User ID is required to revoke recovery codes');
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('user_recovery_codes')
    .update({ revoked_at: nowIso })
    .eq('user_id', userId)
    .is('consumed_at', null)
    .is('revoked_at', null)
    .select('id');

  if (error) {
    // Note: Never log sensitive data or user tokens
    console.error('[recovery-codes] Database error during revocation');
    throw new Error('Failed to revoke active recovery codes');
  }

  return data?.length ?? 0;
}

/**
 * Database operation: Persists an array of SHA-256 hashes to `public.user_recovery_codes`.
 * Enforces that only verifiers/hashes are stored.
 */
export async function storeRecoveryCodeHashes(
  supabaseAdmin: any,
  userId: string,
  hashes: string[]
): Promise<void> {
  if (!userId) {
    throw new Error('User ID is required to store recovery codes');
  }
  if (!Array.isArray(hashes) || hashes.length !== RECOVERY_CODES_COUNT) {
    throw new Error(`Must store exactly ${RECOVERY_CODES_COUNT} recovery code hashes`);
  }

  const nowIso = new Date().toISOString();
  const records = hashes.map((hash) => ({
    user_id: userId,
    code_hash: hash,
    created_at: nowIso,
    consumed_at: null,
    revoked_at: null,
  }));

  const { error } = await supabaseAdmin
    .from('user_recovery_codes')
    .insert(records);

  if (error) {
    console.error('[recovery-codes] Database error during hash insertion');
    throw new Error('Failed to persist recovery code verifiers');
  }
}

export class RecoveryCodesError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.name = 'RecoveryCodesError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Database operation (Phase 4A.2): Atomically revokes old active recovery codes
 * and inserts new code hashes within a single serialized PostgreSQL transaction.
 *
 * Guarantees:
 * - Distributed concurrency synchronization via non-blocking 64-bit advisory transaction locks.
 * - Non-queueing behavior: concurrent requests for the same user immediately fail with 409 Conflict.
 * - Atomicity: revocation and insertion commit together inside a single database transaction.
 * - Rollback safety: failures never leave zero recoverable state or overlapping generations.
 * - Fail-closed: absolutely no silent downgrade fallback to non-atomic multi-query operations.
 */
export async function replaceUserRecoveryCodesAtomic(
  supabaseAdmin: any,
  userId: string,
  hashes: string[]
): Promise<{ revokedCount: number; insertedCount: number }> {
  if (!userId) {
    throw new Error('User ID is required');
  }
  if (!Array.isArray(hashes) || hashes.length !== RECOVERY_CODES_COUNT) {
    throw new Error(`Must store exactly ${RECOVERY_CODES_COUNT} recovery code hashes`);
  }

  if (!supabaseAdmin || typeof supabaseAdmin.rpc !== 'function') {
    console.error('[recovery-codes] Supabase admin client or RPC method is not available');
    throw new RecoveryCodesError(
      'Recovery code service is temporarily unavailable',
      'RECOVERY_CODES_TEMPORARILY_UNAVAILABLE',
      503
    );
  }

  const { data, error } = await supabaseAdmin.rpc('replace_user_recovery_codes_atomic', {
    p_user_id: userId,
    p_code_hashes: hashes,
  });

  if (error) {
    const errMsg = error.message || '';
    if (
      errMsg.includes('RECOVERY_CODES_REGENERATION_IN_PROGRESS') ||
      (error.code === 'P0001' && errMsg.includes('IN_PROGRESS'))
    ) {
      throw new RecoveryCodesError(
        'Recovery code generation is already in progress for this account. Please wait a moment.',
        'RECOVERY_CODES_REGENERATION_IN_PROGRESS',
        409
      );
    }

    if (
      errMsg.includes('does not exist') ||
      errMsg.includes('not found') ||
      errMsg === 'Unknown RPC function' ||
      error.code === '42883' ||
      error.code === 'PGRST202'
    ) {
      console.error('[recovery-codes] replace_user_recovery_codes_atomic RPC is not available in database');
      throw new RecoveryCodesError(
        'Recovery code service is temporarily unavailable',
        'RECOVERY_CODES_TEMPORARILY_UNAVAILABLE',
        503
      );
    }

    console.error('[recovery-codes] Database error during atomic replacement:', errMsg);
    throw new RecoveryCodesError(
      `Failed to replace recovery codes atomically: ${errMsg}`,
      'RECOVERY_CODES_DATABASE_ERROR',
      500
    );
  }

  const record = Array.isArray(data) ? data[0] : data;
  return {
    revokedCount: record?.revoked_count ?? 0,
    insertedCount: record?.inserted_count ?? hashes.length,
  };
}

/**
 * Complete server-side generation flow:
 * 1. Generates exactly 10 fresh, cryptographically secure recovery codes.
 * 2. In a single atomic PostgreSQL transaction, serializes per-user access,
 *    revokes all prior active codes, and persists the new SHA-256 verifier hashes.
 * 3. Returns the 10 plaintext codes strictly once to be presented to the user.
 *
 * Plaintext codes are never logged to console or persisted to disk.
 */
export async function generateAndStoreRecoveryCodes(
  supabaseAdmin: any,
  userId: string,
  entropyBytes: number = DEFAULT_ENTROPY_BYTES
): Promise<string[]> {
  if (!userId) {
    throw new Error('User ID is required');
  }

  // 1. Generate exactly 10 independent codes and compute cryptographic verifier hashes
  const { codes, hashes } = await generateRecoveryCodeSet(RECOVERY_CODES_COUNT, entropyBytes);

  // 2. Atomically revoke prior codes and store new hashes in PostgreSQL transaction
  await replaceUserRecoveryCodesAtomic(supabaseAdmin, userId, hashes);

  // 3. Return plaintext codes strictly once for client retrieval
  return codes;
}

export interface RecoveryCodesStatus {
  hasCodes: boolean;
  activeCount: number;
  createdAt: string | null;
}

/**
 * Retrieves the non-sensitive recovery codes status for a user.
 * Returns only counts and timestamps; never returns hashes or plaintext codes.
 */
export async function getRecoveryCodesStatus(
  supabaseAdmin: any,
  userId: string
): Promise<RecoveryCodesStatus> {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const { data, error } = await supabaseAdmin
    .from('user_recovery_codes')
    .select('created_at')
    .eq('user_id', userId)
    .is('consumed_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[recovery-codes] Database error fetching status');
    throw new Error('Failed to fetch recovery codes status');
  }

  const count = data?.length ?? 0;
  return {
    hasCodes: count > 0,
    activeCount: count,
    createdAt: count > 0 && data[0]?.created_at ? data[0].created_at : null,
  };
}
