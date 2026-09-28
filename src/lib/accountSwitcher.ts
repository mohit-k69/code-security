/**
 * Account Switcher Non-Sensitive Metadata Storage
 *
 * SECURITY INVARIANTS:
 * - Persists ONLY non-sensitive user identity metadata (email, display name, avatar URL, lastUsed timestamp).
 * - NEVER persists passwords, access tokens, refresh tokens, OAuth tokens, session cookies,
 *   recovery codes, or MFA secrets.
 * - Removing a remembered account only deletes the local convenience entry and has no effect
 *   on server authentication or session state.
 */

export interface RememberedAccount {
  email: string;
  name: string;
  avatar?: string;
  lastUsedAt: string;
}

const STORAGE_KEY = 'cody_remembered_accounts';

/**
 * Validates and cleans non-sensitive account metadata.
 */
function sanitizeAccount(raw: any): RememberedAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) return null;

  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : email.split('@')[0];
  const avatar = typeof raw.avatar === 'string' && (raw.avatar.startsWith('http') || raw.avatar.startsWith('data:image'))
    ? raw.avatar
    : undefined;
  const lastUsedAt = typeof raw.lastUsedAt === 'string' ? raw.lastUsedAt : new Date().toISOString();

  // Explicitly return ONLY allowed non-sensitive fields
  return {
    email,
    name,
    avatar,
    lastUsedAt,
  };
}

/**
 * Retrieves all remembered accounts stored on this device.
 */
export function getRememberedAccounts(): RememberedAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeAccount)
      .filter((acc): acc is RememberedAccount => acc !== null)
      .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());
  } catch (err) {
    console.warn('[AccountSwitcher] Failed to read remembered accounts:', err);
    return [];
  }
}

/**
 * Saves or updates a non-sensitive remembered account record.
 */
export function saveRememberedAccount(account: { email: string; name?: string; avatar?: string }): void {
  if (typeof window === 'undefined') return;
  try {
    const email = account.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) return;

    const existing = getRememberedAccounts().filter((a) => a.email !== email);
    const entry: RememberedAccount = {
      email,
      name: account.name?.trim() || email.split('@')[0],
      avatar: account.avatar,
      lastUsedAt: new Date().toISOString(),
    };

    const updated = [entry, ...existing].slice(0, 10); // Keep at most 10 recent accounts
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[AccountSwitcher] Failed to save remembered account:', err);
  }
}

/**
 * Removes a single remembered account convenience entry from this device.
 * Does NOT terminate or invalidate server authentication.
 */
export function removeRememberedAccount(email: string): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = email.trim().toLowerCase();
    const existing = getRememberedAccounts().filter((a) => a.email !== normalized);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch (err) {
    console.warn('[AccountSwitcher] Failed to remove remembered account:', err);
  }
}

/**
 * Clears all remembered accounts from this device.
 */
export function clearAllRememberedAccounts(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[AccountSwitcher] Failed to clear remembered accounts:', err);
  }
}
