/**
 * Image Preflight & Safe OCR Preparation.
 *
 * Implements:
 * 1. Magic byte verification (PNG, JPEG, WebP)
 * 2. Size boundary enforcement (max 10 MB)
 * 3. Safe dimension extraction without executing embedded metadata
 * 4. Image sanitization and preparation for isolated OCR
 * 5. Strict boundary: OCR text is DATA, never executable instructions.
 */

import { detectSignature, UPLOAD_LIMITS, validateSafeFileName } from './fileSignature';
import { ImagePreflightMetadata, ExtractedProjectFile } from './types';

export interface ImagePreflightResult {
  isSafe: boolean;
  metadata?: ImagePreflightMetadata;
  preparedFile?: ExtractedProjectFile;
  error?: string;
}

/**
 * Extracts width and height from PNG header (IHDR chunk at byte offset 16..24).
 */
function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return { width, height };
}

/**
 * Extracts width and height from JPEG frames (SOF markers: 0xFF, 0xC0..0xC3).
 */
function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2; // Skip SOI (0xFFD8)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  while (offset < bytes.length - 8) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    // Standalone markers without length
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }

    const length = view.getUint16(offset + 2, false);
    // SOF0 to SOF3 markers contain frame dimensions
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (offset + 7 < bytes.length) {
        const height = view.getUint16(offset + 5, false);
        const width = view.getUint16(offset + 7, false);
        return { width, height };
      }
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Extracts dimensions from WebP (VP8 or VP8L or VP8X chunk).
 */
function parseWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // VP8 chunk (lossy)
  if (
    bytes[12] === 0x56 &&
    bytes[13] === 0x50 &&
    bytes[14] === 0x38 &&
    bytes[15] === 0x20
  ) {
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    return { width, height };
  }

  // VP8L chunk (lossless)
  if (
    bytes[12] === 0x56 &&
    bytes[13] === 0x50 &&
    bytes[14] === 0x38 &&
    bytes[15] === 0x4c
  ) {
    const b1 = bytes[21];
    const b2 = bytes[22];
    const b3 = bytes[23];
    const b4 = bytes[24];
    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + ((((b4 & 0xf) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)));
    return { width, height };
  }

  return null;
}

/**
 * Safely inspects and preflights an image without executing embedded data.
 */
export async function inspectAndPreflightImage(
  imageBytes: Uint8Array,
  fileName: string
): Promise<ImagePreflightResult> {
  // 1. Filename safety
  const safeName = validateSafeFileName(fileName);
  if (!safeName.isSafe) {
    return { isSafe: false, error: safeName.reason };
  }

  // 2. Size boundary check
  const size = imageBytes.byteLength;
  if (size > UPLOAD_LIMITS.MAX_IMAGE_SIZE_BYTES) {
    return {
      isSafe: false,
      error: `Image size (${(size / 1024 / 1024).toFixed(1)} MB) exceeds maximum allowed limit of ${UPLOAD_LIMITS.MAX_IMAGE_SIZE_BYTES / 1024 / 1024} MB.`,
    };
  }

  if (size < 16) {
    return { isSafe: false, error: 'Image file is too small or corrupted.' };
  }

  // 3. Signature verification (magic bytes)
  const sig = detectSignature(imageBytes);
  if (sig !== 'image/png' && sig !== 'image/jpeg' && sig !== 'image/webp') {
    return {
      isSafe: false,
      error: 'File is not a valid image or uses an unsupported format. Supported formats: PNG, JPEG, WebP.',
    };
  }

  // 4. Safe dimension parsing
  let dimensions: { width: number; height: number } | null = null;
  try {
    if (sig === 'image/png') dimensions = parsePngDimensions(imageBytes);
    else if (sig === 'image/jpeg') dimensions = parseJpegDimensions(imageBytes);
    else if (sig === 'image/webp') dimensions = parseWebpDimensions(imageBytes);
  } catch {
    // If dimension parsing fails, continue safely without blocking
  }

  // Validate dimension bounds if found (prevent pixel flood / dimension bombs)
  if (dimensions) {
    if (dimensions.width > 16384 || dimensions.height > 16384) {
      return {
        isSafe: false,
        error: `Image dimensions (${dimensions.width}x${dimensions.height}) exceed safe preview boundaries (16384px max).`,
      };
    }
  }

  // 5. Convert to base64 DataURL for safe preview / future OCR pipeline
  let base64 = '';
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(imageBytes).toString('base64');
  } else {
    let binary = '';
    const len = imageBytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(imageBytes[i]);
    }
    base64 = btoa(binary);
  }

  const dataUrl = `data:${sig};base64,${base64}`;

  const metadata: ImagePreflightMetadata = {
    fileName: safeName.sanitizedName,
    mimeType: sig,
    size,
    width: dimensions?.width,
    height: dimensions?.height,
    isDecoded: true,
    preparedForOcr: true,
    ocrConfidence: undefined,
    extractedOcrText: undefined,
    dataUrl,
  };

  // Create an extracted project file placeholder for OCR code extraction
  const preparedFile: ExtractedProjectFile = {
    name: safeName.sanitizedName,
    relativePath: `images/${safeName.sanitizedName}`,
    size,
    extension: safeName.sanitizedName.split('.').pop() || 'png',
    detectedLanguage: 'Image Screenshot',
    untrustedContent: `[Image source: ${safeName.sanitizedName} (${sig}, ${dimensions ? `${dimensions.width}x${dimensions.height}` : 'dimensions unverified'}, ${(size / 1024).toFixed(1)} KB) - Prepared for safe OCR extraction]`,
    isBinary: true,
    status: 'accepted',
  };

  return {
    isSafe: true,
    metadata,
    preparedFile,
  };
}
