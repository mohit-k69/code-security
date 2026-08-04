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
]);

const VALID_TLDS = ['.edu', '.gov', '.org', '.co', '.ac', '.mil'];

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
