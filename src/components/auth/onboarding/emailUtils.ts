const VALID_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me',
  'aol.com',
  'zoho.com', 'zohomail.com',
  'mail.com',
  'yandex.com', 'yandex.ru',
  'fastmail.com',
  'tutanota.com', 'tuta.io',
  'gmx.com', 'gmx.net',
  'hey.com',
  'pm.me',
  'rediffmail.com',
  'example.com',
  'company.com',
  'domain.com',
  'test.com',
]);

const VALID_TLDS = ['.edu', '.gov', '.org', '.co', '.ac', '.mil'];

/**
 * Normalizes an email address consistently:
 * - Trims leading/trailing whitespace
 * - Converts to lowercase
 * - Does NOT perform aggressive transformations that could merge legitimate email addresses
 */
export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

export function isValidEmailDomain(email: string): boolean {
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1].toLowerCase();
  if (VALID_DOMAINS.has(domain)) return true;
  return VALID_TLDS.some(tld => domain.endsWith(tld));
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
