"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import {
  createLandingPage,
  updateLandingPage,
  publishLandingPage,
  unpublishLandingPage,
  archiveLandingPage,
  type LpBlock,
  type FunnelConfig,
} from "@/lib/admin/landingPages";
import { safeUrl } from "@hybrid/ui";

export interface LpActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

async function authTenant(): Promise<
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

// Returns an error message if any block contains a URL with a non-http(s) scheme.
function validateBlockUrls(blocks: LpBlock[]): string | null {
  for (const block of blocks) {
    if (block.type === "hero") {
      if (block.cta_url && !safeUrl(block.cta_url)) return "Hero CTA URL-এ শুধু http/https অনুমোদিত।";
      if (block.image_url && !safeUrl(block.image_url)) return "Hero ছবির URL-এ শুধু http/https অনুমোদিত।";
    } else if (block.type === "image") {
      if (block.url && !safeUrl(block.url)) return "ছবির URL-এ শুধু http/https অনুমোদিত।";
    } else if (block.type === "cta") {
      if (block.url && !safeUrl(block.url)) return "CTA URL-এ শুধু http/https অনুমোদিত।";
    }
  }
  return null;
}

function bustPageTags(tenantId: string, slug?: string): void {
  revalidateTag(`tenant:${tenantId}`);
  if (slug) revalidateTag(`tenant:${tenantId}:page:${slug}`);
}

const createSchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, digits, hyphens only"),
  title: z.string().trim().min(1).max(240),
});

const updateSchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  blocks: z.string().optional(),
  funnelConfig: z.string().optional(),
});

export async function createLandingPageAction(raw: unknown): Promise<LpActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "তথ্য সম্পূর্ণ নয়।" };
  }
  try {
    const id = await createLandingPage(auth.tenantId, auth.userId, {
      slug: parsed.data.slug,
      title: parsed.data.title,
    });
    bustPageTags(auth.tenantId, parsed.data.slug);
    return { ok: true, id };
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "23505"
    ) {
      return { ok: false, error: "এই slug ইতিমধ্যে ব্যবহৃত হয়েছে।" };
    }
    return { ok: false, error: "ত্রুটি হয়েছে।" };
  }
}

export async function updateLandingPageAction(
  id: string,
  raw: unknown,
): Promise<LpActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "তথ্য সম্পূর্ণ নয়।" };

  let blocks: LpBlock[] | undefined;
  let funnelConfig: FunnelConfig | undefined;

  if (parsed.data.blocks != null) {
    try { blocks = JSON.parse(parsed.data.blocks) as LpBlock[]; } catch { return { ok: false, error: "Blocks JSON ভুল।" }; }
    const urlErr = validateBlockUrls(blocks);
    if (urlErr) return { ok: false, error: urlErr };
  }
  if (parsed.data.funnelConfig != null) {
    try { funnelConfig = JSON.parse(parsed.data.funnelConfig) as FunnelConfig; } catch { return { ok: false, error: "Funnel config JSON ভুল।" }; }
    // Validate variant_blocks inside A/B config as well
    if (funnelConfig.ab_test?.variant_blocks) {
      const abErr = validateBlockUrls(funnelConfig.ab_test.variant_blocks);
      if (abErr) return { ok: false, error: abErr };
    }
  }

  try {
    await updateLandingPage(auth.tenantId, auth.userId, id, {
      slug: parsed.data.slug,
      title: parsed.data.title,
      blocks,
      funnelConfig,
    });
    bustPageTags(auth.tenantId, parsed.data.slug);
    return { ok: true };
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "23505"
    ) {
      return { ok: false, error: "এই slug ইতিমধ্যে ব্যবহৃত হয়েছে।" };
    }
    return { ok: false, error: "ত্রুটি হয়েছে।" };
  }
}

export async function publishLandingPageAction(id: string): Promise<LpActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return { ok: false, error: auth.error };
  await publishLandingPage(auth.tenantId, auth.userId, id);
  revalidateTag(`tenant:${auth.tenantId}`);
  return { ok: true };
}

export async function unpublishLandingPageAction(id: string): Promise<LpActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return { ok: false, error: auth.error };
  await unpublishLandingPage(auth.tenantId, auth.userId, id);
  revalidateTag(`tenant:${auth.tenantId}`);
  return { ok: true };
}

export async function archiveLandingPageAction(id: string): Promise<void> {
  const auth = await authTenant();
  if (!auth.ok) return;
  await archiveLandingPage(auth.tenantId, auth.userId, id);
  revalidateTag(`tenant:${auth.tenantId}`);
  redirect("/admin/landing-pages");
}
