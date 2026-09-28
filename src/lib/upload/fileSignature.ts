/**
 * File signature validation, MIME sniffing, and boundary enforcement.
 * Enforces size limits, magic bytes, and traversal prevention.
 */

export const UPLOAD_LIMITS = {
  MAX_ZIP_SIZE_BYTES: 25 * 1024 * 1024,      // 25 MB
  MAX_IMAGE_SIZE_BYTES: 5 * 1024 * 1024,     // 5 MB document/image limit
  MAX_SOURCE_FILE_SIZE_BYTES: 2 * 1024 * 1024, // 2 MB source/code/config limit
  MAX_TOTAL_EXTRACTED_BYTES: 50 * 1024 * 1024, // 50 MB extracted content limit
  MAX_REVIEWABLE_FILES: 100,                 // 100 reviewable files limit after extraction/filtering
  MAX_FILE_COUNT: 500,                       // Raw entry bounds protection
  MAX_UPLOAD_FILES_AT_ONCE: 10,
  MAX_DIRECTORY_DEPTH: 10,
  MAX_COMPRESSION_RATIO: 50, // 50:1 ratio triggers bomb protection
} as const;

export type DetectedFileType =
  | 'zip'
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'source_code'
  | 'unsupported_binary'
  | 'unsupported';

export interface FileSignatureValidation {
  isValid: boolean;
  detectedType: DetectedFileType;
  mimeType: string;
  error?: string;
}

// Magic byte signatures
const MAGIC_ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK..
const MAGIC_ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];
const MAGIC_ZIP_SPANNED = [0x50, 0x4b, 0x07, 0x08];

const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAGIC_JPEG = [0xff, 0xd8, 0xff];
const MAGIC_WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]; // RIFF
const MAGIC_WEBP_WEBP = [0x57, 0x45, 0x42, 0x50]; // WEBP at offset 8

// Disallowed binary file extensions that must never be processed as code
export const HAZARDOUS_EXTENSIONS = new Set([
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'dmg', 'apk', 'jar',
  'class', 'vbs', 'msi', 'com', 'bat', 'cmd', 'ps1', 'scr', 'pif',
  'sys', 'drv', 'obj', 'o', 'a', 'lib', 'pyc', 'pyo', 'pyd', 'wasm'
]);

// Whitelisted source code and config extensions
export const SUPPORTED_SOURCE_EXTENSIONS: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JavaScript React',
  ts: 'TypeScript',
  tsx: 'TypeScript React',
  py: 'Python',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  h: 'C/C++ Header',
  hpp: 'C++ Header',
  cs: 'C#',
  go: 'Go',
  rs: 'Rust',
  rb: 'Ruby',
  php: 'PHP',
  html: 'HTML',
  htm: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  json: 'JSON',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  txt: 'Plain Text',
  sql: 'SQL',
  sh: 'Shell Script',
  bash: 'Bash Script',
  zsh: 'Zsh Script',
  swift: 'Swift',
  kt: 'Kotlin',
  kts: 'Kotlin Script',
  dart: 'Dart',
  vue: 'Vue',
  svelte: 'Svelte',
  r: 'R',
  scala: 'Scala',
  lua: 'Lua',
  pl: 'Perl',
  toml: 'TOML',
  ini: 'INI',
  env: 'Environment Config',
  dockerfile: 'Dockerfile',
  dockerignore: 'Dockerignore',
  gitignore: 'Gitignore',
};

/**
 * Checks if a byte buffer matches a given sequence at an offset.
 */
function matchBytes(buffer: Uint8Array, sequence: number[], offset = 0): boolean {
  if (buffer.length < offset + sequence.length) return false;
  for (let i = 0; i < sequence.length; i++) {
    if (buffer[offset + i] !== sequence[i]) return false;
  }
  return true;
}

/**
 * Inspects initial byte signature of a buffer or Uint8Array.
 */
export function detectSignature(bytes: Uint8Array): DetectedFileType {
  if (bytes.length < 2) return 'unsupported';

  // Check ZIP
  if (
    matchBytes(bytes, MAGIC_ZIP) ||
    matchBytes(bytes, MAGIC_ZIP_EMPTY) ||
    matchBytes(bytes, MAGIC_ZIP_SPANNED)
  ) {
    return 'zip';
  }

  // Check PNG
  if (matchBytes(bytes, MAGIC_PNG)) {
    return 'image/png';
  }

  // Check JPEG
  if (matchBytes(bytes, MAGIC_JPEG)) {
    return 'image/jpeg';
  }

  // Check WebP: 'RIFF' at 0 and 'WEBP' at 8
  if (matchBytes(bytes, MAGIC_WEBP_RIFF, 0) && matchBytes(bytes, MAGIC_WEBP_WEBP, 8)) {
    return 'image/webp';
  }

  // Check for common binary executables (ELF, Mach-O, Windows PE, Java bytecode)
  // ELF: 7F 45 4C 46
  if (matchBytes(bytes, [0x7f, 0x45, 0x4c, 0x46])) {
    return 'unsupported_binary';
  }
  // Windows PE MZ: 4D 5A
  if (matchBytes(bytes, [0x4d, 0x5a])) {
    return 'unsupported_binary';
  }
  // Java class / Mach-O Fat (32-bit big-endian): CA FE BA BE
  if (matchBytes(bytes, [0xca, 0xfe, 0xba, 0xbe])) {
    return 'unsupported_binary';
  }
  // Mach-O binaries:
  // 32-bit: FE ED FA CE (big-endian) / CE FA ED FE (little-endian)
  // 64-bit: FE ED FA CF (big-endian) / CF FA ED FE (little-endian)
  // Universal Fat: BE BA FE CA (little-endian) / CA FE BA BF (64-bit) / BF BA FE CA (64-bit LE)
  if (
    matchBytes(bytes, [0xfe, 0xed, 0xfa, 0xce]) ||
    matchBytes(bytes, [0xce, 0xfa, 0xed, 0xfe]) ||
    matchBytes(bytes, [0xfe, 0xed, 0xfa, 0xcf]) ||
    matchBytes(bytes, [0xcf, 0xfa, 0xed, 0xfe]) ||
    matchBytes(bytes, [0xbe, 0xba, 0xfe, 0xca]) ||
    matchBytes(bytes, [0xca, 0xfe, 0xba, 0xbf]) ||
    matchBytes(bytes, [0xbf, 0xba, 0xfe, 0xca])
  ) {
    return 'unsupported_binary';
  }

  return 'source_code';
}

/**
 * Validates a filename against path traversal, control characters, and reserved names.
 */
export function validateSafeFileName(fileName: string): { isSafe: boolean; sanitizedName: string; reason?: string } {
  if (!fileName || typeof fileName !== 'string') {
    return { isSafe: false, sanitizedName: '', reason: 'Filename is empty or invalid.' };
  }

  const trimmed = fileName.trim();

  // Null byte injection check
  if (trimmed.includes('\0')) {
    return { isSafe: false, sanitizedName: '', reason: 'Filename contains forbidden null byte.' };
  }

  // Path traversal sequences
  if (
    trimmed.includes('../') ||
    trimmed.includes('..\\') ||
    trimmed === '..' ||
    trimmed.includes('/..') ||
    trimmed.includes('\\..') ||
    trimmed.includes('%2e%2e') ||
    trimmed.includes('%2E%2E')
  ) {
    return { isSafe: false, sanitizedName: '', reason: 'Path traversal sequence detected in filename.' };
  }

  // Absolute paths & Windows drive-letter paths
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\') ||
    /^[a-zA-Z]:/.test(trimmed)
  ) {
    return { isSafe: false, sanitizedName: '', reason: 'Absolute or drive-letter path is not permitted.' };
  }

  // Reserved DOS/Windows device names
  const baseName = trimmed.split(/[\/\\]/).pop() || '';
  const nameWithoutExt = baseName.split('.')[0].toUpperCase();
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'LPT1', 'LPT2', 'LPT3'];
  if (reservedNames.includes(nameWithoutExt)) {
    return { isSafe: false, sanitizedName: '', reason: `Reserved system name "${nameWithoutExt}" is forbidden.` };
  }

  // Strip hazardous control characters
  const sanitized = trimmed.replace(/[\x00-\x1f\x7f]/g, '');

  return { isSafe: true, sanitizedName: sanitized };
}

/**
 * Normalizes relative path and validates directory depth.
 */
export function validatePathDepth(relativePath: string, maxDepth = UPLOAD_LIMITS.MAX_DIRECTORY_DEPTH): { isValid: boolean; depth: number } {
  const parts = relativePath.split(/[\\\/]+/).filter(Boolean);
  const depth = parts.length;
  return {
    isValid: depth <= maxDepth,
    depth,
  };
}

/**
 * Validates file extension against supported types.
 */
export function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  if (parts.length <= 1) return '';
  return parts.pop() || '';
}

/**
 * Determines whether a file extension corresponds to a supported source code or config file.
 */
export function isSupportedSourceExtension(extension: string): boolean {
  const ext = extension.toLowerCase().replace(/^\./, '');
  return Boolean(SUPPORTED_SOURCE_EXTENSIONS[ext]);
}

/**
 * Detects programming language or file category from extension and name.
 */
export function detectLanguage(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower === 'dockerfile' || lower.endsWith('/dockerfile')) return 'Dockerfile';
  if (lower === 'makefile' || lower.endsWith('/makefile')) return 'Makefile';
  if (lower === '.env' || lower.endsWith('/.env')) return 'Environment Config';
  if (lower.startsWith('.env.') || lower.includes('/.env.')) return 'Environment Config';

  const ext = getExtension(fileName);
  return SUPPORTED_SOURCE_EXTENSIONS[ext] || 'Text';
}
