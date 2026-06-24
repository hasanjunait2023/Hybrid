// Admin image upload receiver (blueprint S-CATALOG / lib/storage).
//
// Multipart POST → auth-gate (getSession) → resolve the user's tenant → hand the
// bytes to the BlobStore. The tenant is derived server-side from the session
// membership (never from the client), so a caller can only ever write into their
// own tenant's uploads dir. Returns { url } for the client to append to the
// product's image list (the reorder/save Server Action persists it).
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { getActiveTenantId } from "@/lib/admin/data";
import { getBlobStore, BlobValidationError } from "@/lib/storage";

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

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ফাইল পাওয়া যায়নি।" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const store = await getBlobStore();
    const { url } = await store.put({
      tenantId,
      bytes,
      mimeType: file.type,
      originalName: file.name,
    });
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
