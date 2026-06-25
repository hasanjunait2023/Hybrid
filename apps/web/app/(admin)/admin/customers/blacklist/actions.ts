"use server";

// Phone blocklist Server Actions (10_fraud.sql / lib/admin/fraud). Authenticate
// + authorize, mutate via withTenant (RLS), revalidate the blocklist + customers
// cache tags. Phone is normalised to digits to keep the (tenant,phone) key clean.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { blockPhone, unblockPhone } from "@/lib/admin/fraud";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function authTenant(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

function bust(tenantId: string): void {
  revalidateTag(`tenant:${tenantId}:blocklist`);
  revalidateTag(`tenant:${tenantId}:customers`);
}

// Bangladesh mobile numbers are 11 digits (01XXXXXXXXX); accept any 6–15 digit
// string after stripping non-digits so pasted "+880" / spaced forms normalise.
const PhoneSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .pipe(z.string().min(6, "ফোন নম্বর সঠিক নয়।").max(15));

export async function blockPhoneAction(phone: string, reason?: string): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = PhoneSchema.safeParse(phone);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ফোন নম্বর সঠিক নয়।" };
  const cleanReason = reason?.trim() ? reason.trim().slice(0, 200) : undefined;
  await blockPhone(auth.tenantId, auth.userId, parsed.data, cleanReason);
  bust(auth.tenantId);
  return { ok: true };
}

export async function unblockPhoneAction(phone: string): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = PhoneSchema.safeParse(phone);
  if (!parsed.success) return { ok: false, error: "ফোন নম্বর সঠিক নয়।" };
  await unblockPhone(auth.tenantId, auth.userId, parsed.data);
  bust(auth.tenantId);
  return { ok: true };
}
