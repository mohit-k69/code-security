/**
 * Safe ZIP Archive Preflight & In-Memory Isolation.
 *
 * Implements defenses against:
 * 1. Zip Slip / Directory Traversal attacks (CVE-2018-1002204 class)
 * 2. Decompression Bombs / Zip Bombs (42.zip, recursive/high-ratio compression)
 * 3. Symlink Hijacking / Out-of-tree link traversal
 * 4. Arbitrary Binary Execution & Build Hook Injection
 *
 * Files are extracted STRICTLY into memory data structures, never to the host filesystem.
 */

import JSZip from 'jszip';
import {
  UPLOAD_LIMITS,
  HAZARDOUS_EXTENSIONS,
  validateSafeFileName,
  validatePathDepth,
  isSupportedSourceExtension,
  detectLanguage,
  getExtension,
  detectSignature,
} from './fileSignature';
import { ExtractedProjectFile } from './types';

export interface ZipPreflightResult {
  isSafe: boolean;
  totalFilesDiscovered: number;
  acceptedFiles: ExtractedProjectFile[];
  rejectedFiles: Array<{ path: string; reason: string }>;
  warnings: string[];
  totalExtractedBytes: number;
  languagesDiscovered: Set<string>;
  error?: string;
}

/**
 * Normalizes a ZIP entry path, stripping redundant slashes and validating safety.
 */
export function sanitizeZipEntryPath(entryPath: string): { isSafe: boolean; cleanPath: string; reason?: string } {
  // Normalize backslashes to forward slashes
  const normalized = entryPath.replace(/\\/g, '/');

  // Basic traversal and safe filename checks
  const safeCheck = validateSafeFileName(normalized);
  if (!safeCheck.isSafe) {
    return { isSafe: false, cleanPath: '', reason: safeCheck.reason };
  }

  // Remove leading './' or '/'
  let clean = normalized.replace(/^(\.\/|\/)+/, '');

  // Split into components and verify none resolve outside virtual root
  const parts = clean.split('/');
  const stack: string[] = [];

  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      return { isSafe: false, cleanPath: '', reason: 'Directory traversal sequence ("..") in path' };
    }
    stack.push(part);
  }

  clean = stack.join('/');
  if (!clean) {
    return { isSafe: false, cleanPath: '', reason: 'Resolved path is empty or root directory' };
  }

  // Check directory depth
  const depthCheck = validatePathDepth(clean);
  if (!depthCheck.isValid) {
    return { isSafe: false, cleanPath: clean, reason: `Directory nesting depth (${depthCheck.depth}) exceeds limit (${UPLOAD_LIMITS.MAX_DIRECTORY_DEPTH})` };
  }

  return { isSafe: true, cleanPath: clean };
}

/**
 * Checks if a zip entry represents a symbolic link (UNIX file mode 0120000).
 */
function isSymlink(entry: JSZip.JSZipObject): boolean {
  // UNIX external file attributes store the file type in high 16 bits
  // S_IFLNK = 0120000 = 0xA000 in hex
  const unixMode = (entry as any).unixPermissions;
  if (typeof unixMode === 'number') {
    return (unixMode & 0o170000) === 0o120000;
  }
  return false;
}

/**
 * Inspects and extracts a ZIP archive in-memory under strict quarantine controls.
 */
export async function inspectAndExtractZip(
  zipBuffer: Uint8Array | ArrayBuffer
): Promise<ZipPreflightResult> {
  const warnings: string[] = [];
  const rejectedFiles: Array<{ path: string; reason: string }> = [];
  const acceptedFiles: ExtractedProjectFile[] = [];
  const languagesDiscovered = new Set<string>();

  // 1. Enforce compressed input size
  const compressedSize = zipBuffer.byteLength;
  if (compressedSize > UPLOAD_LIMITS.MAX_ZIP_SIZE_BYTES) {
    return {
      isSafe: false,
      totalFilesDiscovered: 0,
      acceptedFiles: [],
      rejectedFiles: [],
      warnings: [],
      totalExtractedBytes: 0,
      languagesDiscovered: new Set(),
      error: `ZIP archive size (${(compressedSize / 1024 / 1024).toFixed(1)} MB) exceeds maximum allowed limit of ${UPLOAD_LIMITS.MAX_ZIP_SIZE_BYTES / 1024 / 1024} MB. This ZIP exceeds Cody's 25 MB upload limit.`,
    };
  }

  // 2. Load ZIP structure safely
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer, { checkCRC32: true });
  } catch (err: any) {
    return {
      isSafe: false,
      totalFilesDiscovered: 0,
      acceptedFiles: [],
      rejectedFiles: [],
      warnings: [],
      totalExtractedBytes: 0,
      languagesDiscovered: new Set(),
      error: `Corrupted or invalid ZIP file: ${err?.message || 'Failed to parse archive headers.'}`,
    };
  }

  // 3. Collect entries and check total file count
  const entries: JSZip.JSZipObject[] = [];
  zip.forEach((_relativePath, file) => {
    entries.push(file);
  });

  if (entries.length > UPLOAD_LIMITS.MAX_FILE_COUNT) {
    return {
      isSafe: false,
      totalFilesDiscovered: entries.length,
      acceptedFiles: [],
      rejectedFiles: [],
      warnings: ['Excessive file count detected in archive.'],
      totalExtractedBytes: 0,
      languagesDiscovered: new Set(),
      error: `ZIP archive contains ${entries.length} items, which exceeds the limit of ${UPLOAD_LIMITS.MAX_FILE_COUNT} files.`,
    };
  }

  let cumulativeExtractedBytes = 0;

  // 4. Inspect each entry before reading bytes
  for (const entry of entries) {
    if (entry.dir) continue; // Skip directory entries

    const rawPath = (entry as any).unsafeOriginalName || entry.name;

    // Check for symbolic links
    if (isSymlink(entry)) {
      warnings.push(`Ignored symbolic link "${rawPath}" to prevent arbitrary link traversal.`);
      rejectedFiles.push({ path: rawPath, reason: 'Symbolic links are rejected for security.' });
      continue;
    }

    // Path sanitization and Zip Slip prevention
    const sanitized = sanitizeZipEntryPath(rawPath);
    if (!sanitized.isSafe) {
      warnings.push(`Rejected entry "${rawPath}": ${sanitized.reason}`);
      rejectedFiles.push({ path: rawPath, reason: sanitized.reason || 'Zip Slip / path traversal detected' });
      continue;
    }

    const cleanPath = sanitized.cleanPath;
    const fileName = cleanPath.split('/').pop() || cleanPath;
    const extension = getExtension(fileName);

    // Filter hazardous binaries (.exe, .dll, .so, etc.)
    if (HAZARDOUS_EXTENSIONS.has(extension)) {
      warnings.push(`Filtered out executable/binary file: ${cleanPath}`);
      rejectedFiles.push({ path: cleanPath, reason: `Binary extension .${extension} is not supported for code review.` });
      continue;
    }

    // Inspect pre-extraction uncompressed size from metadata
    const uncompressedSize = (entry as any)._data?.uncompressedSize ?? (entry as any).uncompressedSize;
    if (typeof uncompressedSize === 'number') {
      // Check decompression bomb per-file ratio
      const entryCompressedSize = (entry as any)._data?.compressedSize ?? (entry as any).compressedSize ?? 1;
      if (entryCompressedSize > 0) {
        const ratio = uncompressedSize / entryCompressedSize;
        if (ratio > UPLOAD_LIMITS.MAX_COMPRESSION_RATIO && uncompressedSize > 1024 * 1024) {
          return {
            isSafe: false,
            totalFilesDiscovered: entries.length,
            acceptedFiles: [],
            rejectedFiles,
            warnings,
            totalExtractedBytes: cumulativeExtractedBytes,
            languagesDiscovered,
            error: `Decompression bomb detected: file "${cleanPath}" has an abnormal compression ratio of ${ratio.toFixed(1)}:1.`,
          };
        }
      }

      // Check single file size limit
      if (uncompressedSize > UPLOAD_LIMITS.MAX_SOURCE_FILE_SIZE_BYTES) {
        warnings.push(`Skipped large file "${cleanPath}" (${(uncompressedSize / 1024 / 1024).toFixed(1)} MB > 2 MB).`);
        rejectedFiles.push({ path: cleanPath, reason: "This file exceeds Cody's 2 MB code-file limit." });
        continue;
      }
    }

    // Filter by supported source code/config extension
    // Ignore build/cache folders (.git, node_modules, dist, .next, __pycache__)
    const pathLower = cleanPath.toLowerCase();
    if (
      pathLower.startsWith('.git/') ||
      pathLower.includes('/.git/') ||
      pathLower.startsWith('node_modules/') ||
      pathLower.includes('/node_modules/') ||
      pathLower.startsWith('__pycache__/') ||
      pathLower.includes('/__pycache__/') ||
      pathLower.startsWith('venv/') ||
      pathLower.includes('/venv/') ||
      pathLower.startsWith('.idea/') ||
      pathLower.startsWith('.vscode/')
    ) {
      rejectedFiles.push({ path: cleanPath, reason: 'Ignored version-control or dependency cache artifact.' });
      continue;
    }

    if (!isSupportedSourceExtension(extension) && fileName !== 'Dockerfile' && fileName !== 'Makefile') {
      rejectedFiles.push({ path: cleanPath, reason: `Unsupported file extension .${extension || 'none'}` });
      continue;
    }

    // 5. Read raw entry bytes in-memory for binary signature verification BEFORE text decoding
    let rawBytes: Uint8Array;
    try {
      rawBytes = await entry.async('uint8array');
    } catch (readErr: any) {
      warnings.push(`Failed to read file "${cleanPath}": ${readErr?.message || 'Read error'}`);
      rejectedFiles.push({ path: cleanPath, reason: 'Failed to decompress file content.' });
      continue;
    }

    const fileSize = rawBytes.byteLength;
    cumulativeExtractedBytes += fileSize;

    // Check cumulative extraction limit (Zip bomb defense & 50 MB total extracted content limit)
    if (cumulativeExtractedBytes > UPLOAD_LIMITS.MAX_TOTAL_EXTRACTED_BYTES) {
      return {
        isSafe: false,
        totalFilesDiscovered: entries.length,
        acceptedFiles: [],
        rejectedFiles,
        warnings,
        totalExtractedBytes: cumulativeExtractedBytes,
        languagesDiscovered,
        error: `Decompression limit exceeded: total extracted size exceeded maximum safety threshold of ${UPLOAD_LIMITS.MAX_TOTAL_EXTRACTED_BYTES / 1024 / 1024} MB. This project exceeds Cody's 50 MB extracted-content limit.`,
      };
    }

    // Check single file size limit against actual extracted size
    if (fileSize > UPLOAD_LIMITS.MAX_SOURCE_FILE_SIZE_BYTES) {
      warnings.push(`Skipped large file "${cleanPath}" (${(fileSize / 1024 / 1024).toFixed(1)} MB > 2 MB).`);
      rejectedFiles.push({ path: cleanPath, reason: "This file exceeds Cody's 2 MB code-file limit." });
      continue;
    }

    // Check overall compression ratio if compressedSize is known
    if (compressedSize > 0) {
      const overallRatio = cumulativeExtractedBytes / compressedSize;
      if (overallRatio > UPLOAD_LIMITS.MAX_COMPRESSION_RATIO && cumulativeExtractedBytes > 10 * 1024 * 1024) {
        return {
          isSafe: false,
          totalFilesDiscovered: entries.length,
          acceptedFiles: [],
          rejectedFiles,
          warnings,
          totalExtractedBytes: cumulativeExtractedBytes,
          languagesDiscovered,
          error: `Decompression bomb detected: archive expansion ratio (${overallRatio.toFixed(1)}:1) exceeds safe threshold.`,
        };
      }
    }

    // Binary sniffing check: verify raw bytes before any UTF-8/text decoding
    const signature = detectSignature(rawBytes);
    if (signature === 'unsupported_binary') {
      warnings.push(`Filtered out executable/binary file: ${cleanPath}`);
      rejectedFiles.push({
        path: cleanPath,
        reason: 'Binary executable signature detected in file content.',
      });
      continue;
    }

    // 6. Decode file text ONLY after passing binary signature validation
    let textContent: string;
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      textContent = decoder.decode(rawBytes);
    } catch (decodeErr: any) {
      warnings.push(`Failed to decode file "${cleanPath}": ${decodeErr?.message || 'Decode error'}`);
      rejectedFiles.push({ path: cleanPath, reason: 'Failed to decode file content as text.' });
      continue;
    }

    const lang = detectLanguage(fileName);
    languagesDiscovered.add(lang);

    acceptedFiles.push({
      name: fileName,
      relativePath: cleanPath,
      size: fileSize,
      extension,
      detectedLanguage: lang,
      untrustedContent: textContent,
      isBinary: false,
      status: 'accepted',
    });
  }

  // 6. Enforce reviewable file count limit (Max 100 reviewable files after extraction/filtering)
  if (acceptedFiles.length > UPLOAD_LIMITS.MAX_REVIEWABLE_FILES) {
    return {
      isSafe: false,
      totalFilesDiscovered: entries.length,
      acceptedFiles: [],
      rejectedFiles,
      warnings: ['Reviewable file limit exceeded.'],
      totalExtractedBytes: cumulativeExtractedBytes,
      languagesDiscovered,
      error: "This project contains more than 100 reviewable files.",
    };
  }

  if (acceptedFiles.length === 0 && rejectedFiles.length > 0) {
    const hasBinary = rejectedFiles.some(rf =>
      HAZARDOUS_EXTENSIONS.has(getExtension(rf.path)) || /binary|executable/i.test(rf.reason)
    );
    return {
      isSafe: false,
      totalFilesDiscovered: entries.length,
      acceptedFiles: [],
      rejectedFiles,
      warnings,
      totalExtractedBytes: cumulativeExtractedBytes,
      languagesDiscovered,
      error: hasBinary
        ? 'Executable binary or installer detected in archive.'
        : 'Archive contains no supported source code or configuration files.',
    };
  }

  return {
    isSafe: true,
    totalFilesDiscovered: entries.length,
    acceptedFiles,
    rejectedFiles,
    warnings,
    totalExtractedBytes: cumulativeExtractedBytes,
    languagesDiscovered,
  };
}
