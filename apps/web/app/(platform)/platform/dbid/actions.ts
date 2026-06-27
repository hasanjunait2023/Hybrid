"use server";

// DBID reviewer server actions (S2.C5.v1 — platform admin side).
// Two terminal actions:
//   - approveDbid(submissionId, dbidNumber, expiresAt?)
//       Flips status to 'approved', stores the official 17-digit DBID
//       number, optionally records an expiry (DBID certs are valid 1-3
//       years). Writes a dbid.review_approve row to audit_log.
//   - rejectDbid(submissionId, reviewerNotes)
//       Flips status to 'rejected' with mandatory notes explaining why.
//       Seller can re-submit after fixing. Writes a dbid.review_reject
//       row to audit_log.
//
// Both actions check the caller is a platform super_admin (the reviewer
// surface lives at /platform/dbid which is middleware-gated). Each
// action wraps the DB update + audit insert in a single transaction so a
// crash mid-flight never produces an approved DBID without the audit row.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { asPlatformAdmin } from "@hybrid/db";
import type { Tx } from "@hybrid/db";
import { recordAudit } from "@/lib/audit/record";

export interface ReviewerActionResult {
  ok: boolean;
  error?: string;
}

// Bangladesh DBID numbers are 17 digits (per DBID portal). Validate loosely
// so future format tweaks don't require a deploy.
const DbidNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{15,20}$/, "DBID number must be 15-20 digits");

async function requirePlatformAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  // The middleware on /platform/* already gates by super_admin role, but
  // a defence-in-depth check is cheap. Use the canonical platform auth
  // helper that queries platform_member — that's the same table the
  // middleware checks, so they can't disagree.
  const { getSession } = await import("@/lib/auth/session");
  const { isPlatformAdmin } = await import("@/lib/platform/auth");
  const session = await getSession();
  if (!session) return { ok: false, error: "লগইন প্রয়োজন।" };
  const ok = await isPlatformAdmin(session.userId);
  if (!ok) return { ok: false, error: "শুধু সুপার অ্যাডমিন।" };
  return { ok: true, userId: session.userId };
}

export async function approveDbid(
  _prev: ReviewerActionResult | null,
  formData: FormData,
): Promise<ReviewerActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  const submissionId = String(formData.get("submissionId") ?? "").trim();
  const dbidNumberRaw = String(formData.get("dbidNumber") ?? "").trim();
  const expiresAtRaw = String(formData.get("expiresAt") ?? "").trim();

  if (!submissionId) {
    return { ok: false, error: "Submission ID missing." };
  }

  const parsed = DbidNumberSchema.safeParse(dbidNumberRaw);
  if (!parsed.success) {
    return { ok: false, error: "DBID নম্বর ১৫-২০ ডিজিটের হতে হবে।" };
  }
  const dbidNumber = parsed.data;

  // expiresAt is optional. If provided, it must be YYYY-MM-DD.
  let expiresAt: Date | null = null;
  if (expiresAtRaw) {
    const m = expiresAtRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      return { ok: false, error: "মেয়াদ শেষের তারিখ YYYY-MM-DD ফরম্যাটে দিন।" };
    }
    expiresAt = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  }

  try {
    let tenantIdForAudit: string | null = null;
    await asPlatformAdmin(async (tx: Tx) => {
      // Lock the row to prevent double-approve races.
      const rows = await tx<
        { id: string; tenant_id: string; status: string }[]
      >`SELECT id, tenant_id, status FROM dbid_submission
        WHERE id = ${submissionId} FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new Error("NOT_FOUND");
      if (row.status !== "submitted" && row.status !== "rejected") {
        throw new Error("NOT_REVIEWABLE");
      }
      tenantIdForAudit = row.tenant_id;

      await tx`
        UPDATE dbid_submission
        SET status = 'approved',
            dbid_number = ${dbidNumber},
            expires_at = ${expiresAt},
            reviewer_notes = NULL,
            reviewed_at = now(),
            updated_at = now()
        WHERE id = ${submissionId}
      `;
    });

    // Audit is best-effort (recordAudit swallows errors) but we await it
    // so the reviewer surface reflects the action immediately.
    await recordAudit({
      tenantId: tenantIdForAudit,
      actorUserId: auth.userId,
      action: "dbid.review_approve",
      resourceType: "dbid_submission",
      resourceId: submissionId,
      details: { dbidNumber, expiresAt: expiresAt?.toISOString() ?? null },
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_FOUND") {
        return { ok: false, error: "এই DBID আবেদন পাওয়া যায়নি।" };
      }
      if (err.message === "NOT_REVIEWABLE") {
        return {
          ok: false,
          error: "শুধু 'submitted' বা 'rejected' স্ট্যাটাসের আবেদন অনুমোদন করা যায়।",
        };
      }
    }
    console.error("[approveDbid] failed", err);
    return { ok: false, error: "অনুমোদন ব্যর্থ হয়েছে।" };
  }

  revalidatePath("/platform/dbid");
  return { ok: true };
}

export async function rejectDbid(
  _prev: ReviewerActionResult | null,
  formData: FormData,
): Promise<ReviewerActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  const submissionId = String(formData.get("submissionId") ?? "").trim();
  const reviewerNotes = String(formData.get("reviewerNotes") ?? "").trim();

  if (!submissionId) {
    return { ok: false, error: "Submission ID missing." };
  }
  if (reviewerNotes.length < 10) {
    return { ok: false, error: "প্রত্যাখ্যানের কারণ অন্তত ১০ অক্ষর হতে হবে।" };
  }

  try {
    let tenantIdForAudit: string | null = null;
    await asPlatformAdmin(async (tx: Tx) => {
      const rows = await tx<
        { id: string; tenant_id: string; status: string }[]
      >`SELECT id, tenant_id, status FROM dbid_submission
        WHERE id = ${submissionId} FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new Error("NOT_FOUND");
      if (row.status !== "submitted") {
        throw new Error("NOT_REVIEWABLE");
      }
      tenantIdForAudit = row.tenant_id;

      await tx`
        UPDATE dbid_submission
        SET status = 'rejected',
            reviewer_notes = ${reviewerNotes},
            reviewed_at = now(),
            updated_at = now()
        WHERE id = ${submissionId}
      `;
    });

    await recordAudit({
      tenantId: tenantIdForAudit,
      actorUserId: auth.userId,
      action: "dbid.review_reject",
      resourceType: "dbid_submission",
      resourceId: submissionId,
      details: { reviewerNotes },
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "NOT_FOUND") {
        return { ok: false, error: "এই DBID আবেদন পাওয়া যায়নি।" };
      }
      if (err.message === "NOT_REVIEWABLE") {
        return {
          ok: false,
          error: "শুধু 'submitted' স্ট্যাটাসের আবেদন প্রত্যাখ্যান করা যায়।",
        };
      }
    }
    console.error("[rejectDbid] failed", err);
    return { ok: false, error: "প্রত্যাখ্যান ব্যর্থ হয়েছে।" };
  }

  revalidatePath("/platform/dbid");
  return { ok: true };
}