"use server";

// B2B customer Server Actions.
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

function bustTags(tenantId: string): void {
  revalidateTag(`tenant:${tenantId}`);
  revalidateTag(`tenant:${tenantId}:wholesale:customers`);
}

const B2BCustomerSchema = z.object({
  customerId: z.string().uuid(),
  businessName: z.string().trim().max(200).optional().default(""),
  customerType: z.enum(["end_consumer", "retailer", "distributor", "wholesaler"]),
  tradeLicenseNo: z.string().trim().max(100).optional().default(""),
  binNo: z.string().trim().max(100).optional().default(""),
  creditLimit: z.coerce.number().min(0).max(10_000_000).default(0),
  isVerified: z.boolean().default(false),
});

export async function saveB2BCustomer(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = B2BCustomerSchema.safeParse({
    customerId: formData.get("customerId"),
    businessName: formData.get("businessName") ?? "",
    customerType: formData.get("customerType"),
    tradeLicenseNo: formData.get("tradeLicenseNo") ?? "",
    binNo: formData.get("binNo") ?? "",
    creditLimit: formData.get("creditLimit") || 0,
    isVerified: formData.get("isVerified") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ইনপুট ভুল।" };
  }
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      await tx`
        update customer
           set business_name = ${input.businessName || null},
               customer_type = ${input.customerType}::customer_type,
               trade_license_no = ${input.tradeLicenseNo || null},
               bin_no = ${input.binNo || null},
               credit_limit = ${input.creditLimit},
               is_verified = ${input.isVerified}
         where id = ${input.customerId}
      `;
    });
  } catch (error) {
    console.error("[saveB2BCustomer] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  bustTags(auth.tenantId);
  return { ok: true };
}
