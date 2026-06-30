// Admin image + video upload receiver (blueprint S-CATALOG / lib/storage).
//
// Multipart POST → auth-gate (getSession) → resolve the user's tenant → hand the
// bytes to the BlobStore. The tenant is derived server-side from the session
// membership (never from the client), so a caller can only ever write into their
// own tenant's uploads dir. Returns { url } (and for videos, { url, duration }
// when the client posts an HTMLMediaElement-derived duration).
//
// Upload kind is controlled by the "kind" form field:
//   * "image" (default) → image validation, 5 MB cap, image/* mimes (existing).
//   * "video"            → video validation, 50 MB cap, video/mp4+video/webm (R1).
//
// Two validations live in lib/storage/{index,video}.ts; this route is the
// dispatcher and does NOT hard-code mime lists — keeps the contract DRY.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { getActiveTenantId } from "@/lib/admin/data";
import { getBlobStore, BlobValidationError } from "@/lib/storage";
import { validateVideo } from "@/lib/storage/video";

export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // CSRF: this is a cookie-authed, state-changing POST. Route Handlers don't get
  // Next's automatic Server-Action Origin check, so verify same-origin explicitly
  // (same guard every /api/auth/* route uses). Returns 403 on mismatch.
  const badOrigin = requireSameOrigin(request);
  if (badOrigin) return badOrigin;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "লগইন প্রয়োজন।" }, { status: 401 });
  }

  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) {
    return NextResponse.json({ error: "কোনো স্টোর পাওয়া যায়নি।" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "ফাইল পাওয়া যায়নি।" }, { status: 400 });
  }

  const kind = form.get("kind");
  const isVideo = kind === "video";

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ফাইল পাওয়া যায়নি।" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // For videos, validate up-front (mime + 50 MB cap). Same shape as image put()
  // — the storage backend takes the canonical { tenantId, bytes, mimeType,
  // originalName } for both kinds; the validation step is the only divider.
  if (isVideo) {
    try {
      validateVideo({ bytes, mimeType: file.type, originalName: file.name });
    } catch (error) {
      if (error instanceof BlobValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  }

  try {
    const store = await getBlobStore();
    const { url } = await store.put({
      tenantId,
      bytes,
      mimeType: file.type,
      originalName: file.name,
    });
    if (isVideo) return NextResponse.json({ url });
    return NextResponse.json({ url });
  } catch (error) {
    if (error instanceof BlobValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Don't leak internals; log server-side context only.
    console.error("[upload] failed", error);
    return NextResponse.json({ error: "আপলোড ব্যর্থ হয়েছে।" }, { status: 500 });
  }
}
