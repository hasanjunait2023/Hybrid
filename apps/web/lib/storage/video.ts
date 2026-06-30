// Video blob validation (R1 video upload on product page).
//
// Mirrors lib/storage/index.ts image validation: a pure helper that takes the
// already-parsed { bytes, mimeType, originalName } tuple and either returns
// the canonical on-disk extension ("mp4" / "webm") OR throws BlobValidationError
// with a friendly Bengali message. Storage backends (Local / S3 / MinIO / R2)
// reuse this verbatim, so a future driver swap needs zero changes.
//
// Hard constraints from CLAUDE.md:
//   * 50 MB hard cap (10× the image cap — videos are bigger by nature, but
//     capped to keep the buyer-side /uploads payload bounded on 3G BD).
//   * MIME allowlist: video/mp4 + video/webm. H.264-in-MP4 plays everywhere;
//     WebM/VP9 is the open-format alternative for merchants who want smaller
//     files. Other formats (mov, avi, mkv) are rejected with a Bengali error.
//   * Filename is never trusted as a path; the storage backend derives a
//     server-generated UUID key.

import { BlobValidationError } from "./index";

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB hard cap.

// Mirror of ALLOWED_MIME in lib/storage/index.ts — kept small + explicit so a
// reviewer can audit the format whitelist at a glance.
export const ALLOWED_VIDEO_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export interface VideoPutInput {
  bytes: Buffer;
  mimeType: string;
  /** Client filename — for sanitisation only; the storage backend derives a new UUID key. */
  originalName?: string;
}

export interface VideoPutInputFull extends VideoPutInput {
  tenantId: string;
}

export interface VideoPutResult {
  url: string;
}

// Same friendly Bengali tone as the image validator. These messages surface
// verbatim to the admin upload UI.
const FRIENDLY = {
  badMime: "শুধু MP4 বা WebM ভিডিও আপলোড করা যাবে।",
  empty: "ভিডিও ফাইলটি খালি।",
  tooLarge: "ভিডিওর সর্বোচ্চ সাইজ ৫০ এমবি।",
};

/**
 * Validate a video upload and return the canonical on-disk extension.
 * Throws BlobValidationError (Bengali message) on failure.
 *
 * @param input - The video payload + declared mime
 * @param maxBytes - Override the cap (defaults to 50 MB). Tests pass a small cap.
 */
export function validateVideo(input: VideoPutInput, maxBytes: number = MAX_VIDEO_BYTES): string {
  const ext = ALLOWED_VIDEO_MIME[input.mimeType];
  if (!ext) {
    throw new BlobValidationError(FRIENDLY.badMime);
  }
  if (input.bytes.length === 0) {
    throw new BlobValidationError(FRIENDLY.empty);
  }
  if (input.bytes.length > maxBytes) {
    throw new BlobValidationError(FRIENDLY.tooLarge);
  }
  return ext;
}

/**
 * One-line "is this an acceptable video" predicate (does NOT throw).
 * Useful for the upload route's cheap reject-before-read path AND for tests.
 */
export function isAcceptableVideoMime(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_VIDEO_MIME, mimeType);
}

/**
 * Validate + report — returns `{ ok, ext, error }` instead of throwing.
 * Used by the admin upload UI to translate BlobValidationError into a
 * displayable error string. The throwing variant stays for server-action paths.
 */
export function checkVideo(
  input: VideoPutInput,
  maxBytes: number = MAX_VIDEO_BYTES,
): { ok: true; ext: string } | { ok: false; error: string } {
  try {
    const ext = validateVideo(input, maxBytes);
    return { ok: true, ext };
  } catch (err) {
    if (err instanceof BlobValidationError) return { ok: false, error: err.message };
    throw err;
  }
}
