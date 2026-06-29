"use server";

// Store-pages Server Actions. Sellers create/edit/delete their static & policy
// pages; the storefront renders published ones at /pages/[slug]. Busts the
// per-page storefront cache tag on every change.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { upsertStorePage, deleteStorePage } from "@/lib/admin/pages";

export interface PageActionResult {
  ok: boolean;
  error?: string;
  slug?: string;
}

async function auth(): Promise<
  | { ok: true; tenantId: string; userId: string }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

// Reserved slugs that would collide with real storefront routes.
const RESERVED = new Set(["home", "products", "cart", "checkout", "order", "wholesale", "pages"]);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SaveSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(60)
    .refine((s) => SLUG_RE.test(s), "স্লাগে শুধু ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন।")
    .refine((s) => !RESERVED.has(s), "এই স্লাগটি সংরক্ষিত।"),
  title: z.string().trim().min(1, "শিরোনাম দিন।").max(160),
  body: z.string().max(20000).optional().default(""),
  status: z.enum(["draft", "published"]),
  seoTitle: z.string().trim().max(160).optional().default(""),
  seoDescription: z.string().trim().max(300).optional().default(""),
});

export async function savePageAction(raw: unknown): Promise<PageActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const parsed = SaveSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  try {
    const { slug } = await upsertStorePage(a.tenantId, a.userId, parsed.data);
    revalidateTag(`tenant:${a.tenantId}`);
    revalidateTag(`tenant:${a.tenantId}:page:${slug}`);
    return { ok: true, slug };
  } catch (err) {
    if (err instanceof Error && /unique|duplicate|23505/i.test(err.message)) {
      return { ok: false, error: "এই স্লাগে আগেই একটি পেজ আছে।" };
    }
    console.error("[savePage] failed", err);
    return { ok: false, error: "পেজ সেভ করা যায়নি।" };
  }
}

export async function deletePageAction(id: string): Promise<PageActionResult> {
  const a = await auth();
  if (!a.ok) return a;
  const uid = z.string().uuid().safeParse(id);
  if (!uid.success) return { ok: false, error: "অবৈধ অনুরোধ।" };
  const { slug } = await deleteStorePage(a.tenantId, a.userId, uid.data);
  revalidateTag(`tenant:${a.tenantId}`);
  if (slug) revalidateTag(`tenant:${a.tenantId}:page:${slug}`);
  return { ok: true, slug: slug ?? undefined };
}
