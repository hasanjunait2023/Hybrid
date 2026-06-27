"use server";

// DBID Compliance Wizard Server Actions (Tier 3 P1 — regulatory moat).
// Three actions: saveDraft (advances step), previousStep, submitForReview.
// Each call uses withTenant so RLS enforces tenant isolation. Document numbers
// (NID/TIN/Trade License/BIN) are sealed AES-256-GCM before storage — same
// pattern as the SMS / WhatsApp credential envelopes. Only the last-4 hint
// ever leaves the server in plain text (returned to the UI for the "this
// document is on file" indicator).
//
// What this wizard DOES NOT do:
//   - It does NOT call a2i / myInfo portal APIs (Phase 2).
//   - It does NOT issue a DBID number (only DBID can).
//   - It does NOT auto-approve (status moves to 'submitted' and waits).
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { withTenant, sealCredentials } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";

export interface DbidActionResult {
  ok: boolean;
  error?: string;
  /** New step after save (1..4) — UI uses this to advance the wizard. */
  step?: 1 | 2 | 3 | 4;
}

type Jsonb = Parameters<Tx["json"]>[0];

async function authTenant(): Promise<
  { ok: true; tenantId: string; userId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return { ok: false, error: "কোনো স্টোর পাওয়া যায়নি।" };
  return { ok: true, tenantId, userId: session.userId };
}

// ---- Validation schemas ---------------------------------------------------

const BusinessTypeEnum = z.enum(["proprietorship", "partnership", "ltd"]);

// Step 1: business identity
const Step1Input = z.object({
  businessName: z.string().trim().min(2).max(200),
  businessType: BusinessTypeEnum,
  ownerFullName: z.string().trim().min(2).max(120),
  ownerDob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD format expected"),
});

// Step 2: NID. BD NIDs are either 10 or 17 digits.
const Step2Input = z.object({
  nid: z
    .string()
    .trim()
    .regex(/^\d{10}$|^\d{17}$/, "NID must be 10 or 17 digits"),
});

// Step 3: TIN + Trade License (+ optional BIN)
const Step3Input = z.object({
  tin: z.string().trim().regex(/^\d{12}$/, "TIN must be 12 digits"),
  tradeLicense: z.string().trim().min(3).max(80),
  tradeLicenseIssued: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD format expected"),
  tradeLicenseExpires: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD format expected"),
  bin: z
    .string()
    .trim()
    .regex(/^\d{9,13}$/, "BIN must be 9-13 digits")
    .optional()
    .or(z.literal("")),
});

// ---- Helpers --------------------------------------------------------------

function sealDoc(number: string) {
  const last4 = number.slice(-4);
  return {
    envelope: sealCredentials({ number }),
    last4,
  };
}

// Upsert the wizard row for this tenant. Always reads first so we never
// clobber a previously-saved step's data when the user edits an earlier
// step. Idempotent on tenant_id (UNIQUE constraint backs this up).
async function upsertWizard(
  tx: Parameters<Parameters<typeof withTenant>[2]>[0],
  tenantId: string,
  patch: Record<string, unknown>,
  advanceToStep?: 1 | 2 | 3 | 4,
) {
  // Read current row to merge with patch (so re-saving step 1 doesn't blow
  // away step 2's NID envelope).
  const existing = await tx<{
    id: string;
    step: number;
    status: string;
  }[]>`select id, step, status from dbid_submission where tenant_id = ${tenantId} limit 1`;

  const newStep = advanceToStep ?? Math.max(existing[0]?.step ?? 1, 1);
  const newStatus = existing[0]?.status ?? "in_progress";

  if (existing[0]) {
    await tx`
      update dbid_submission
      set ${tx.json(patch as unknown as Jsonb)},
          step = ${newStep},
          status = ${newStatus},
          updated_at = now()
      where id = ${existing[0].id}
    `;
  } else {
    // postgres.js doesn't expose tx.insert() — write a tagged INSERT and
    // splice the patch values via JSON (avoids SQL injection by typing the
    // parameter as jsonb on the DB side). Cast to the expected parameter
    // types so the generic Tx<never> doesn't complain about `unknown`.
    const jsonParam = (v: unknown) =>
      tx.json(v as Parameters<Tx["json"]>[0]);
    await tx`
      insert into dbid_submission (
        tenant_id, nid_sealed, tin_sealed, trade_license_sealed, bin_sealed,
        business_name, business_type, owner_full_name, owner_dob,
        step, status
      ) values (
        ${tenantId},
        ${patch.nid_sealed ? jsonParam(patch.nid_sealed) : null},
        ${patch.tin_sealed ? jsonParam(patch.tin_sealed) : null},
        ${patch.trade_license_sealed ? jsonParam(patch.trade_license_sealed) : null},
        ${patch.bin_sealed ? jsonParam(patch.bin_sealed) : null},
        ${(patch.business_name as string | undefined) ?? null},
        ${(patch.business_type as string | undefined) ?? null},
        ${(patch.owner_full_name as string | undefined) ?? null},
        ${(patch.owner_dob as string | undefined) ?? null},
        ${newStep},
        ${newStatus}
      )
    `;
  }
  return newStep;
}

// ---- Actions --------------------------------------------------------------

export async function saveStep1(
  _prev: DbidActionResult | null,
  formData: FormData,
): Promise<DbidActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = Step1Input.safeParse({
    businessName: formData.get("businessName"),
    businessType: formData.get("businessType"),
    ownerFullName: formData.get("ownerFullName"),
    ownerDob: formData.get("ownerDob"),
  });
  if (!parsed.success) {
    return { ok: false, error: "ব্যবসার তথ্য যাচাই করুন।" };
  }
  const input = parsed.data;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      await upsertWizard(
        tx,
        auth.tenantId,
        {
          business_name: input.businessName,
          business_type: input.businessType,
          owner_full_name: input.ownerFullName,
          owner_dob: input.ownerDob,
        },
        2,
      );
    });
  } catch (error) {
    console.error("[saveStep1] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  revalidateTag(`tenant:${auth.tenantId}:dbid`);
  return { ok: true, step: 2 };
}

export async function saveStep2(
  _prev: DbidActionResult | null,
  formData: FormData,
): Promise<DbidActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = Step2Input.safeParse({ nid: formData.get("nid") });
  if (!parsed.success) {
    return { ok: false, error: "NID নম্বর ১০ বা ১৭ ডিজিটের হতে হবে।" };
  }
  const sealed = sealDoc(parsed.data.nid);

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      await upsertWizard(
        tx,
        auth.tenantId,
        { nid_sealed: sealed.envelope },
        3,
      );
    });
  } catch (error) {
    console.error("[saveStep2] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  revalidateTag(`tenant:${auth.tenantId}:dbid`);
  return { ok: true, step: 3 };
}

export async function saveStep3(
  _prev: DbidActionResult | null,
  formData: FormData,
): Promise<DbidActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const parsed = Step3Input.safeParse({
    tin: formData.get("tin"),
    tradeLicense: formData.get("tradeLicense"),
    tradeLicenseIssued: formData.get("tradeLicenseIssued"),
    tradeLicenseExpires: formData.get("tradeLicenseExpires"),
    bin: formData.get("bin") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: "TIN + ট্রেড লাইসেন্স তথ্য যাচাই করুন।" };
  }
  const input = parsed.data;
  const tinSealed = sealDoc(input.tin);
  const tradeSealed = {
    envelope: sealCredentials({
      number: input.tradeLicense,
      issuedAt: input.tradeLicenseIssued,
      expiresAt: input.tradeLicenseExpires,
    }),
    last4: input.tradeLicense.slice(-4),
  };
  const binSealed = input.bin ? sealDoc(input.bin) : null;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      await upsertWizard(
        tx,
        auth.tenantId,
        {
          tin_sealed: tinSealed.envelope,
          trade_license_sealed: tradeSealed.envelope,
          ...(binSealed ? { bin_sealed: binSealed.envelope } : {}),
        },
        4,
      );
    });
  } catch (error) {
    console.error("[saveStep3] failed", error);
    return { ok: false, error: "সেভ ব্যর্থ হয়েছে।" };
  }

  revalidateTag(`tenant:${auth.tenantId}:dbid`);
  return { ok: true, step: 4 };
}

// Final submit — status moves to 'submitted' and we record the timestamp.
// Reviewer approval/rejection is done by a platform admin (separate surface
// in a later phase). Re-submission after rejection is allowed: the row stays,
// status flips back to 'in_progress' so the wizard is editable again.
export async function submitForReview(
  _prev: DbidActionResult | null,
  formData: FormData,
): Promise<DbidActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const confirmed = formData.get("confirmed") === "true";
  if (!confirmed) {
    return { ok: false, error: "জমা দেওয়ার আগে নিশ্চিতকরণ বাক্সে টিক দিন।" };
  }

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      const rows = await tx<{ id: string; step: number; status: string }[]>`
        select id, step, status from dbid_submission where tenant_id = ${auth.tenantId} limit 1
      `;
      const row = rows[0];
      if (!row) {
        throw new Error("NO_DRAFT");
      }
      if (row.step < 4) {
        throw new Error("INCOMPLETE");
      }
      if (row.status === "submitted" || row.status === "approved") {
        // Idempotent: already submitted, no error.
        return;
      }

      await tx`
        update dbid_submission
        set status = 'submitted',
            submitted_at = coalesce(submitted_at, now()),
            updated_at = now()
        where id = ${row.id}
      `;
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NO_DRAFT") {
        return { ok: false, error: "প্রথমে সব ধাপ পূরণ করুন।" };
      }
      if (error.message === "INCOMPLETE") {
        return { ok: false, error: "সব ধাপ শেষ করে তারপর জমা দিন।" };
      }
    }
    console.error("[submitForReview] failed", error);
    return { ok: false, error: "জমা ব্যর্থ হয়েছে।" };
  }

  revalidateTag(`tenant:${auth.tenantId}:dbid`);
  return { ok: true };
}

// Allow the seller to go back to an earlier step for editing. We bump the
// wizard back to that step and flip status to in_progress if it was rejected
// (so a rejected submission becomes editable again).
export async function goToStep(
  _prev: DbidActionResult | null,
  formData: FormData,
): Promise<DbidActionResult> {
  const auth = await authTenant();
  if (!auth.ok) return auth;

  const target = Number(formData.get("step"));
  if (!Number.isInteger(target) || target < 1 || target > 4) {
    return { ok: false, error: "অবৈধ ধাপ।" };
  }
  const targetStep = target as 1 | 2 | 3 | 4;

  try {
    await withTenant(auth.tenantId, auth.userId, async (tx) => {
      await tx`
        update dbid_submission
        set step = ${targetStep},
            status = case when status = 'rejected' then 'in_progress' else status end,
            updated_at = now()
        where tenant_id = ${auth.tenantId}
      `;
    });
  } catch (error) {
    console.error("[goToStep] failed", error);
    return { ok: false, error: "ধাপ পরিবর্তন ব্যর্থ হয়েছে।" };
  }

  revalidateTag(`tenant:${auth.tenantId}:dbid`);
  return { ok: true, step: targetStep };
}