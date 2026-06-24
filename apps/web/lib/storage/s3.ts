// S3-compatible BlobStore (blueprint S-S3-BLOB; research §Topic 3). Implements
// the SAME BlobStore interface as LocalBlobStore via @aws-sdk/client-s3 with an
// endpoint override, so it works against Cloudflare R2, Backblaze B2, MinIO, and
// AWS S3 with no code change — only env differs.
//
// Loaded ONLY through the dynamic import in getBlobStore() (BLOB_DRIVER=s3), so
// the ~450KB AWS SDK never lands on the default cold-start path.
//
// Key layout {tenantId}/{uuid}.{ext} is IDENTICAL to LocalBlobStore — the public
// URL is the only thing that differs (CDN/bucket host vs /uploads/...). Uploads
// are server-side (PutObjectCommand) via the existing /api/admin/upload route;
// the 5MB cap + mime/filename validation is reused verbatim (validate /
// assertTenantId from ./index), so every caller stays protected by construction.
import "server-only";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import {
  type BlobStore,
  type PutInput,
  type PutResult,
  ALLOWED_MIME,
  validate,
  assertTenantId,
} from "./index";

// Resolved S3 configuration. endpoint is empty for AWS S3, a full URL for
// R2/B2/MinIO. publicBaseUrl is the host the stored product_image.url points at
// (a CDN domain, an R2 public bucket URL, or the S3 virtual-hosted URL).
interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  forcePathStyle: boolean;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required when BLOB_DRIVER=s3`);
  return v;
}

function loadConfig(): S3Config {
  const bucket = requireEnv("S3_BUCKET");
  const region = process.env.S3_REGION || "auto";
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const accessKeyId = requireEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("S3_SECRET_ACCESS_KEY");

  // Public base for stored URLs. Explicit S3_PUBLIC_BASE_URL wins (CDN / R2
  // public bucket). Otherwise derive a sensible default per backend.
  const explicitPublic = process.env.S3_PUBLIC_BASE_URL;
  const publicBaseUrl = explicitPublic
    ? explicitPublic.replace(/\/+$/, "")
    : endpoint
      ? `${endpoint.replace(/\/+$/, "")}/${bucket}`
      : `https://${bucket}.s3.${region}.amazonaws.com`;

  // MinIO and some S3-compatibles need path-style addressing; R2/B2 do not.
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

  return { bucket, region, endpoint, accessKeyId, secretAccessKey, publicBaseUrl, forcePathStyle };
}

export class S3BlobStore implements BlobStore {
  private readonly client: S3Client;
  private readonly config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(input: PutInput): Promise<PutResult> {
    const ext = validate(input);
    assertTenantId(input.tenantId);

    // Server-generated UUID key — the client filename is never used in the key,
    // so traversal/collision is impossible. Same shape as LocalBlobStore.
    const key = `${input.tenantId}/${randomUUID()}.${ext}`;
    const contentType = mimeForExt(ext, input.mimeType);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: input.bytes,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return { url: `${this.config.publicBaseUrl}/${key}` };
  }

  async remove(url: string): Promise<void> {
    // Only delete objects under our own public base, and only the {tenant}/{file}
    // key we issued — never an arbitrary path.
    const prefix = `${this.config.publicBaseUrl}/`;
    if (!url.startsWith(prefix)) return;
    const key = url.slice(prefix.length);
    if (!key || key.includes("..")) return;

    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
  }
}

// Prefer the validated request mime; fall back to the canonical mime for the ext.
function mimeForExt(ext: string, requestMime: string): string {
  if (ALLOWED_MIME[requestMime] === ext) return requestMime;
  const found = Object.entries(ALLOWED_MIME).find(([, e]) => e === ext);
  return found ? found[0] : "application/octet-stream";
}

/** Build an S3BlobStore from env. Called by getBlobStore() for BLOB_DRIVER=s3. */
export function createS3BlobStore(): S3BlobStore {
  return new S3BlobStore(loadConfig());
}
