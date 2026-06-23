// BlobStore — product-image storage abstraction (blueprint "apps/web shared
// cores" → lib/storage/index.ts).
//
//   * P1: LocalBlobStore writes apps/web/public/uploads/{tenantId}/{uuid}.{ext}
//     and returns a /uploads/... URL Next serves statically. The dir is
//     gitignored (see apps/web/public/uploads/.gitignore).
//   * P2: a SupabaseBlobStore implements the same interface; swap via BLOB_DRIVER.
//
// URLs are opaque and stored verbatim in product_image.url. Validation
// (mime image/*, size cap, filename sanitize / no path traversal) happens here
// so every caller is protected by construction.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB cap — 3G upload budget.

// image/* mimes we accept, mapped to the canonical extension we write.
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export interface PutInput {
  tenantId: string;
  bytes: Buffer;
  mimeType: string;
  /** Original client filename — used only to derive a safe extension; never trusted as a path. */
  originalName?: string;
}

export interface PutResult {
  /** Public, opaque URL stored in product_image.url. */
  url: string;
}

export interface BlobStore {
  put(input: PutInput): Promise<PutResult>;
  /** Remove a previously stored blob by its public URL. Best-effort. */
  remove(url: string): Promise<void>;
}

export class BlobValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlobValidationError";
  }
}

// Validate + resolve the on-disk extension. Throws BlobValidationError (friendly
// Bengali message) on a bad mime / oversize payload — callers surface it to the UI.
function validate(input: PutInput): string {
  const ext = ALLOWED_MIME[input.mimeType];
  if (!ext) {
    throw new BlobValidationError("শুধু ছবি আপলোড করা যাবে (JPG, PNG, WebP, AVIF, GIF)।");
  }
  if (input.bytes.length === 0) {
    throw new BlobValidationError("ফাইলটি খালি।");
  }
  if (input.bytes.length > MAX_UPLOAD_BYTES) {
    throw new BlobValidationError("ছবির সর্বোচ্চ সাইজ ৫ এমবি।");
  }
  return ext;
}

// tenantId comes from the authenticated session (a UUID) — but we still
// hard-validate it as a UUID so a crafted value can never escape the uploads
// root via path traversal.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertTenantId(tenantId: string): void {
  if (!UUID_RE.test(tenantId)) {
    throw new BlobValidationError("অবৈধ স্টোর আইডি।");
  }
}

const UPLOADS_URL_PREFIX = "/uploads/";

export class LocalBlobStore implements BlobStore {
  private readonly publicDir: string;

  constructor(publicDir = join(process.cwd(), "public")) {
    this.publicDir = publicDir;
  }

  async put(input: PutInput): Promise<PutResult> {
    const ext = validate(input);
    assertTenantId(input.tenantId);

    // Filename is a server-generated UUID — the client's originalName is never
    // used in the path, so traversal (../, absolute paths) is impossible.
    const filename = `${randomUUID()}.${ext}`;
    const dir = join(this.publicDir, "uploads", input.tenantId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), input.bytes);

    return { url: `${UPLOADS_URL_PREFIX}${input.tenantId}/${filename}` };
  }

  async remove(url: string): Promise<void> {
    // Only delete inside the uploads root, and only well-formed paths we issued.
    if (!url.startsWith(UPLOADS_URL_PREFIX)) return;
    const rel = url.slice(UPLOADS_URL_PREFIX.length);
    // Reject any traversal attempt before touching the filesystem.
    if (rel.includes("..") || rel.includes("\\") || rel.startsWith("/")) return;
    const target = join(this.publicDir, "uploads", rel);
    await rm(target, { force: true });
  }
}

let cached: BlobStore | null = null;

/** Factory by BLOB_DRIVER (default "local"). Memoized per process. */
export function getBlobStore(): BlobStore {
  if (cached) return cached;
  const driver = process.env.BLOB_DRIVER ?? "local";
  switch (driver) {
    case "local":
      cached = new LocalBlobStore();
      return cached;
    default:
      // SupabaseBlobStore lands in Phase 2; fail loudly rather than silently
      // misrouting uploads.
      throw new Error(`Unknown BLOB_DRIVER: ${driver}`);
  }
}
