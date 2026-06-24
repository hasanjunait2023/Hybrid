"use server";

// Discount Server Actions (blueprint S-DISCOUNTS 2.4, DESIGN §Q6). Every action
// authenticates (getSession) and authorizes (membership → tenant), then mutates
// via withTenant (RLS). Code uniqueness is enforced by the DB
// unique(tenant_id, code) constraint, caught here and surfaced as a Bengali
// error. Zod validates at the trust boundary before any DB write.
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface ActionResult {
  ok: boolean;
  error?: string;
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

// A blank-string datetime-local field → null. Coerce to a Date or null.
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.union([z.string().datetime({ offset: true }), z.string().min(1), z.null()]))
  .transform((v) => (v == null ? null : new Date(v)))
  .refine((d) => d == null || !Number.isNaN(d.getTime()), "তারিখ ভুল।");

const optionalPositiveInt = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : NaN;
  })
  .refine((n) => n === null || (Number.isInteger(n) && n > 0), "ধনাত্মক সংখ্যা দিন।");

const DiscountSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z
      .string()
      .trim()
      .min(1, "কোড দিন")
      .max(40, "কোড খুব বড়")
      .regex(/^[A-Za-z0-9_-]+$/, "কোডে শুধু অক্ষর, সংখ্যা, - বা _ ব্যবহার করুন"),
    title: z.string().trim().max(120).optional().default(""),
    type: z.enum(["percentage", "fixed_amount", "free_shipping"]),
    value: z.coerce.number().min(0).max(10_000_000),
    minSubtotal: z.coerce.number().min(0).max(10_000_000).default(0),
    usageLimit: optionalPositiveInt,
    perCustomerLimit: optionalPositiveInt,
    startsAt: optionalDate,
    endsAt: optionalDate,
    status: z.enum(["active", "scheduled", "expired", "disabled"]).default("active"),
  })
  .refine(
    (d) => d.type !== "percentage" || (d.value > 0 && d.value <= 100),
    { message: "শতকরা মান ১–১০০ এর মধ্যে দিন।", path: ["value"] },
  )
  .refine(
    (d) => d.type === "free_shipping" || d.value > 0,
    { message: "মান ০ এর বেশি দিন।", path: ["value"] },
  )
  .refine(
    (d) => d.startsAt == null || d.endsAt == null || d.endsAt > d.startsAt,
    { message: "শেষ তারিখ শুরুর পরে হতে হবে।", path: ["endsAt"] },
  );

function readForm(formData: FormData) {
  return {
    id: formData.get("id") || undefined,
    code: formData.get("code"),
    title: formData.get("title") ?? "",
    type: formData.get("type"),
    value: formData.get("value"),
    minSubtotal: formData.get("minSubtotal") ?? 0,
    usageLimit: formData.get("usageLimit"),
    perCustomerLimit: formData.get("perCustomerLimit"),
    startsAt: formData.get("startsAt") ?? undefined,
    endsAt: formData.get("endsAt") ?? undefined,
    status: formData.get("status") ?? "active",
  };
}

export async function saveDiscount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = DiscountSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const d = parsed.data;
  // free_shipping carries no monetary value of its own.
  const value = d.type === "free_shipping" ? 0 : d.value;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      if (d.id) {
        await tx`
          update discount
             set code = ${d.code}, title = ${d.title || null},
                 type = ${d.type}::discount_type, value = ${value},
                 min_subtotal = ${d.minSubtotal},
                 usage_limit = ${d.usageLimit}, per_customer_limit = ${d.perCustomerLimit},
                 starts_at = ${d.startsAt}, ends_at = ${d.endsAt},
                 status = ${d.status}::discount_status, updated_at = now()
           where id = ${d.id}
        `;
      } else {
        await tx`
          insert into discount
            (tenant_id, code, title, type, value, min_subtotal,
             usage_limit, per_customer_limit, starts_at, ends_at, status)
          values
            (${auth.tenantId}, ${d.code}, ${d.title || null}, ${d.type}::discount_type,
             ${value}, ${d.minSubtotal}, ${d.usageLimit}, ${d.perCustomerLimit},
             ${d.startsAt}, ${d.endsAt}, ${d.status}::discount_status)
        `;
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "এই কোডে একটি ডিসকাউন্ট আগে থেকেই আছে।" };
    }
    console.error("[saveDiscount] failed", error);
    return { ok: false, error: "ডিসকাউন্ট সেভ ব্যর্থ হয়েছে।" };
  }

  revalidateTag(`tenant:${auth.tenantId}:discounts`);
  redirect("/admin/discounts");
}

export async function deleteDiscount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "ডিসকাউন্ট পাওয়া যায়নি।" };

  await withTenant(auth.tenantId, auth.userId, async (tx) => {
    await tx`delete from discount where id = ${id.data}`;
  });
  revalidateTag(`tenant:${auth.tenantId}:discounts`);
  redirect("/admin/discounts");
}
