"use client";

// DBID Compliance Wizard — client component. The wizard has 4 steps; the
// current step is rendered as a form. Server Actions save each step and
// advance. The "previous" button rewinds without saving.
//
// Layout: stacked vertically (mobile-first), with a step indicator on top
// showing 1..4 with the active step highlighted. Each step uses native form
// elements — no extra UI deps — because the real value is in the data model,
// not the chrome.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDict } from "@/lib/i18n/provider";
import {
  saveStep1,
  saveStep2,
  saveStep3,
  submitForReview,
  goToStep,
  type DbidActionResult,
} from "./actions";
import type { DbidSubmission, DbidStatus } from "@/lib/admin/dbid";

interface DbidFormProps {
  submission: DbidSubmission | null;
}

const STATUS_BADGE_CLASS: Record<DbidStatus, string> = {
  not_started: "bg-surface-2 text-ink-muted",
  in_progress: "bg-amber-100 text-amber-900",
  submitted: "bg-blue-100 text-blue-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-900",
};

export function DbidForm({ submission }: DbidFormProps) {
  const t = useDict().admin.settingsDbid;
  const router = useRouter();

  // Current step: read from server, but allow optimistic local updates so
  // the UI advances immediately after a successful save.
  const initialStep: 1 | 2 | 3 | 4 = submission?.step ?? 1;
  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const status: DbidStatus = submission?.status ?? "not_started";
  const isLocked = status === "submitted" || status === "approved";

  // Helper: run a server action and handle the common result envelope.
  function run(
    fn: (
      prev: DbidActionResult | null,
      fd: FormData,
    ) => Promise<DbidActionResult>,
    fd: FormData,
    onSuccess?: (result: DbidActionResult) => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await fn(null, fd);
      if (!result.ok) {
        setError(result.error ?? t.saveFailed);
      } else if (onSuccess) {
        onSuccess(result);
      }
      router.refresh();
    });
  }

  function handlePrevious() {
    if (step <= 1) return;
    const fd = new FormData();
    fd.set("step", String(step - 1));
    run(goToStep, fd, (r) => {
      if (r.step) setStep(r.step);
    });
  }

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[status]}`}
          >
            {t.status[status]}
          </span>
          {submission?.dbidNumber && (
            <span className="text-sm text-ink-muted">
              {t.dbidNumber}: <span className="font-mono">{submission.dbidNumber}</span>
            </span>
          )}
          {submission?.expiresAt && (
            <span className="text-sm text-ink-muted">
              {t.expiresOn}: {new Date(submission.expiresAt).toLocaleDateString("en-GB")}
            </span>
          )}
        </div>
        {isLocked && (
          <span className="text-xs text-ink-muted">
            {t.previousStep} → unlock needed
          </span>
        )}
      </div>

      {/* Reviewer notes (only on rejection) */}
      {status === "rejected" && submission?.reviewerNotes && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <div className="font-semibold">{t.reviewNotes}</div>
          <div className="mt-1">{submission.reviewerNotes}</div>
        </div>
      )}

      {/* Step indicator */}
      <StepIndicator activeStep={step} status={status} />

      {/* Step body */}
      <div className="rounded-lg border border-border bg-surface p-5">
        {step === 1 && (
          <Step1Form
            submission={submission}
            pending={pending}
            error={error}
            onSubmit={(fd) =>
              run(saveStep1, fd, (r) => {
                if (r.step) setStep(r.step);
              })
            }
          />
        )}
        {step === 2 && (
          <Step2Form
            submission={submission}
            pending={pending}
            error={error}
            onSubmit={(fd) =>
              run(saveStep2, fd, (r) => {
                if (r.step) setStep(r.step);
              })
            }
          />
        )}
        {step === 3 && (
          <Step3Form
            submission={submission}
            pending={pending}
            error={error}
            onSubmit={(fd) =>
              run(saveStep3, fd, (r) => {
                if (r.step) setStep(r.step);
              })
            }
          />
        )}
        {step === 4 && (
          <Step4Review
            submission={submission}
            pending={pending}
            error={error}
            onSubmit={(fd) =>
              run(submitForReview, fd, () => {
                /* status flips to submitted on the server, refresh surfaces it */
              })
            }
          />
        )}
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrevious}
          disabled={step <= 1 || pending || isLocked}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← {t.previousStep}
        </button>
      </div>
    </div>
  );
}

// ---- Step indicator -------------------------------------------------------

function StepIndicator({
  activeStep,
  status,
}: {
  activeStep: 1 | 2 | 3 | 4;
  status: DbidStatus;
}) {
  const t = useDict().admin.settingsDbid;
  // The title accessor is locked to the step sub-objects so TS doesn't widen
  // `t[s.key]` to the whole settingsDbid union (which includes `status`,
  // a string map without a .title).
  const titles: Record<1 | 2 | 3 | 4, string> = {
    1: t.step1.title,
    2: t.step2.title,
    3: t.step3.title,
    4: t.step4.title,
  };
  const steps: Array<{ n: 1 | 2 | 3 | 4 }> = [
    { n: 1 },
    { n: 2 },
    { n: 3 },
    { n: 4 },
  ];
  const isLocked = status === "submitted" || status === "approved";
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <ol className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => {
        const isActive = s.n === activeStep;
        const isDone = s.n < activeStep;
        const reachable =
          !isLocked && (s.n <= activeStep || (status === "rejected" && s.n <= 4));

        return (
          <li key={s.n} className="flex items-center gap-2">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => {
                if (!reachable) return;
                const fd = new FormData();
                fd.set("step", String(s.n));
                startTransition(async () => {
                  await goToStep(null, fd);
                  router.refresh();
                });
              }}
              className={[
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                isActive
                  ? "bg-primary text-white"
                  : isDone
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-surface-2 text-ink-muted",
                reachable ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed",
              ].join(" ")}
              aria-current={isActive ? "step" : undefined}
            >
              {s.n}
            </button>
            <span
              className={
                isActive ? "font-semibold text-ink" : "text-ink-muted"
              }
            >
              {titles[s.n]}
            </span>
            {i < steps.length - 1 && <span className="text-ink-subtle">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ---- Step 1: Business identity -------------------------------------------

function Step1Form({
  submission,
  pending,
  error,
  onSubmit,
}: {
  submission: DbidSubmission | null;
  pending: boolean;
  error: string | null;
  onSubmit: (fd: FormData) => void;
}) {
  const t = useDict().admin.settingsDbid;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold text-ink">{t.step1.title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t.step1.hint}</p>
      </div>

      <Field label={t.step1.businessNameLabel}>
        <input
          name="businessName"
          required
          minLength={2}
          maxLength={200}
          defaultValue={submission?.businessName ?? ""}
          placeholder={t.step1.businessNamePlaceholder}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <Field label={t.step1.businessTypeLabel}>
        <select
          name="businessType"
          required
          defaultValue={submission?.businessType ?? ""}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="" disabled>
            —
          </option>
          <option value="proprietorship">{t.step1.businessTypes.proprietorship}</option>
          <option value="partnership">{t.step1.businessTypes.partnership}</option>
          <option value="ltd">{t.step1.businessTypes.ltd}</option>
        </select>
      </Field>

      <Field label={t.step1.ownerFullNameLabel}>
        <input
          name="ownerFullName"
          required
          minLength={2}
          maxLength={120}
          defaultValue={submission?.ownerFullName ?? ""}
          placeholder={t.step1.ownerFullNamePlaceholder}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <Field label={t.step1.ownerDobLabel}>
        <input
          name="ownerDob"
          type="date"
          required
          defaultValue={submission?.ownerDob ?? ""}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <SubmitRow pending={pending} error={error} nextLabel={t.nextStep} />
    </form>
  );
}

// ---- Step 2: NID ---------------------------------------------------------

function Step2Form({
  submission,
  pending,
  error,
  onSubmit,
}: {
  submission: DbidSubmission | null;
  pending: boolean;
  error: string | null;
  onSubmit: (fd: FormData) => void;
}) {
  const t = useDict().admin.settingsDbid;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold text-ink">{t.step2.title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t.step2.hint}</p>
      </div>

      <Field label={t.step2.nidLabel}>
        <input
          name="nid"
          required
          pattern="^\d{10}$|^\d{17}$"
          inputMode="numeric"
          defaultValue=""
          placeholder={submission?.nidLast4 ? `••••${submission.nidLast4}` : t.step2.nidPlaceholder}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono"
        />
        {submission?.nidLast4 && (
          <p className="mt-1 text-xs text-ink-muted">
            ✓ {t.step2.nidLabel}: ••••{submission.nidLast4}
          </p>
        )}
      </Field>

      <SubmitRow pending={pending} error={error} nextLabel={t.nextStep} />
    </form>
  );
}

// ---- Step 3: TIN + Trade License -----------------------------------------

function Step3Form({
  submission,
  pending,
  error,
  onSubmit,
}: {
  submission: DbidSubmission | null;
  pending: boolean;
  error: string | null;
  onSubmit: (fd: FormData) => void;
}) {
  const t = useDict().admin.settingsDbid;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold text-ink">{t.step3.title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t.step3.hint}</p>
      </div>

      <Field label={t.step3.tinLabel}>
        <input
          name="tin"
          required
          pattern="^\d{12}$"
          inputMode="numeric"
          defaultValue=""
          placeholder={submission?.tinLast4 ? `••••${submission.tinLast4}` : t.step3.tinPlaceholder}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono"
        />
        {submission?.tinLast4 && (
          <p className="mt-1 text-xs text-ink-muted">
            ✓ {t.step3.tinLabel}: ••••{submission.tinLast4}
          </p>
        )}
      </Field>

      <Field label={t.step3.tradeLicenseLabel}>
        <input
          name="tradeLicense"
          required
          minLength={3}
          maxLength={80}
          defaultValue=""
          placeholder={
            submission?.tradeLicenseLast4
              ? `••••${submission.tradeLicenseLast4}`
              : t.step3.tradeLicensePlaceholder
          }
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono"
        />
        {submission?.tradeLicenseLast4 && (
          <p className="mt-1 text-xs text-ink-muted">
            ✓ {t.step3.tradeLicenseLabel}: ••••{submission.tradeLicenseLast4}
          </p>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.step3.tradeLicenseIssuedLabel}>
          <input
            name="tradeLicenseIssued"
            type="date"
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </Field>
        <Field label={t.step3.tradeLicenseExpiresLabel}>
          <input
            name="tradeLicenseExpires"
            type="date"
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <Field label={t.step3.binLabel}>
        <input
          name="bin"
          pattern="^\d{9,13}$"
          inputMode="numeric"
          defaultValue=""
          placeholder={submission?.binLast4 ? `••••${submission.binLast4}` : t.step3.binPlaceholder}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono"
        />
        {submission?.binLast4 && (
          <p className="mt-1 text-xs text-ink-muted">
            ✓ {t.step3.binLabel}: ••••{submission.binLast4}
          </p>
        )}
      </Field>

      <SubmitRow pending={pending} error={error} nextLabel={t.nextStep} />
    </form>
  );
}

// ---- Step 4: Review & submit ---------------------------------------------

function Step4Review({
  submission,
  pending,
  error,
  onSubmit,
}: {
  submission: DbidSubmission | null;
  pending: boolean;
  error: string | null;
  onSubmit: (fd: FormData) => void;
}) {
  const t = useDict().admin.settingsDbid;
  const alreadySubmitted = submission?.status === "submitted";
  const isApproved = submission?.status === "approved";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-lg font-semibold text-ink">{t.step4.title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t.step4.hint}</p>
      </div>

      <div className="space-y-2 rounded-md border border-border bg-surface-2 p-4 text-sm">
        <Row label={t.step1.businessNameLabel} value={submission?.businessName ?? "—"} />
        <Row label={t.step1.businessTypeLabel} value={submission?.businessType ?? "—"} />
        <Row label={t.step1.ownerFullNameLabel} value={submission?.ownerFullName ?? "—"} />
        <Row label={t.step1.ownerDobLabel} value={submission?.ownerDob ?? "—"} />
        <Row label={t.step2.nidLabel} value={submission?.nidLast4 ? `••••${submission.nidLast4}` : "—"} />
        <Row label={t.step3.tinLabel} value={submission?.tinLast4 ? `••••${submission.tinLast4}` : "—"} />
        <Row
          label={t.step3.tradeLicenseLabel}
          value={submission?.tradeLicenseLast4 ? `••••${submission.tradeLicenseLast4}` : "—"}
        />
        {submission?.binLast4 && (
          <Row label={t.step3.binLabel} value={`••••${submission.binLast4}`} />
        )}
      </div>

      {alreadySubmitted ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          ✓ {t.status.submitted}
          {submission?.submittedAt && (
            <span className="ml-2 text-blue-700">
              {t.submittedOn}: {new Date(submission.submittedAt).toLocaleString("en-GB")}
            </span>
          )}
        </div>
      ) : isApproved ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          ✓ {t.status.approved}
          {submission?.dbidNumber && (
            <span className="ml-2 font-mono">{submission.dbidNumber}</span>
          )}
        </div>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="confirmed"
              value="true"
              required
              className="mt-1 h-4 w-4 rounded border-border"
            />
            <span className="text-ink">{t.step4.confirmLabel}</span>
          </label>
          <button
            type="submit"
            disabled={pending}
            className="min-h-[44px] rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "..." : t.submitForReview}
          </button>
          {error && <p className="text-sm text-rose-700">{error}</p>}
        </>
      )}
    </form>
  );
}

// ---- Shared atoms ---------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

function SubmitRow({
  pending,
  error,
  nextLabel,
}: {
  pending: boolean;
  error: string | null;
  nextLabel: string;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <button
        type="submit"
        disabled={pending}
        className="min-h-[44px] rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "..." : nextLabel}
      </button>
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1 last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  );
}