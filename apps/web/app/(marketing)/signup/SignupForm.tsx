"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@hybrid/ui";
import { signupAction, type SignupState } from "./actions";
import { normalizeSlug, validateSlug, SLUG_ERROR_BN } from "./slug";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

const INITIAL: SignupState = {};

interface SignupLabels {
  storeNameLabel: string;
  storeNameHint: string;
  storeAddressLabel: string;
  storeAddressHint: string;
  suggestionsLabel: string;
  emailLabel: string;
  passwordLabel: string;
  passwordHint: string;
  submit: string;
  submitting: string;
  trialNote: string;
}

// Labels are resolved server-side (cookie locale) and passed in, so the form
// follows the active language without a client LocaleProvider in this route.
export function SignupForm({ labels }: { labels: SignupLabels }) {
  const [state, formAction] = useActionState(signupAction, INITIAL);
  const [slug, setSlug] = useState(state.values?.slug ?? "");

  // Cross-host redirect (apex → admin.{ROOT}) must happen client-side; a Server
  // Action redirect() can't switch hosts. We navigate once the action succeeds.
  useEffect(() => {
    if (state.ok && state.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state.ok, state.redirectTo]);

  // Live client-side slug validation for instant feedback. The server re-validates
  // (and owns uniqueness) — this only mirrors the same rules for a faster UX.
  const clientSlugError = slug.length > 0 ? validateSlug(slug) : null;
  const serverSlugError = state.errors?.slug;

  const storeNameId = useId();
  const slugId = useId();
  const emailId = useId();
  const passwordId = useId();

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.errors?.form ? (
        <p
          role="alert"
          className="bn-body rounded-md border border-danger/30 bg-danger-weak px-4 py-3 text-sm text-danger"
        >
          {state.errors.form}
        </p>
      ) : null}

      <Field
        id={storeNameId}
        label={labels.storeNameLabel}
        hint={labels.storeNameHint}
        error={state.errors?.storeName}
      >
        <input
          id={storeNameId}
          name="storeName"
          type="text"
          required
          maxLength={60}
          defaultValue={state.values?.storeName}
          autoComplete="organization"
          className={inputClass(Boolean(state.errors?.storeName))}
          aria-invalid={Boolean(state.errors?.storeName)}
        />
      </Field>

      <Field
        id={slugId}
        label={labels.storeAddressLabel}
        error={serverSlugError ?? (clientSlugError ? SLUG_ERROR_BN[clientSlugError] : undefined)}
      >
        <div
          className={[
            "flex items-stretch overflow-hidden rounded-md border bg-surface",
            serverSlugError || clientSlugError ? "border-danger" : "border-border-strong",
            "focus-within:shadow-focus",
          ].join(" ")}
        >
          <input
            id={slugId}
            name="slug"
            type="text"
            inputMode="url"
            required
            value={slug}
            onChange={(e) => setSlug(normalizeSlug(e.target.value))}
            placeholder="rahim"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={Boolean(serverSlugError || clientSlugError)}
            className="min-h-[44px] min-w-0 flex-1 bg-transparent px-3 font-latin text-base text-ink outline-none placeholder:text-ink-subtle"
          />
          <span
            className="flex select-none items-center whitespace-nowrap bg-surface-2 px-3 font-latin text-sm text-ink-muted"
            aria-hidden="true"
          >
            .{ROOT}
          </span>
        </div>
        <p className="bn-body mt-1.5 text-xs text-ink-subtle">
          {labels.storeAddressHint}
        </p>
      </Field>

      {state.suggestions && state.suggestions.length > 0 ? (
        <div className="-mt-2 flex flex-wrap items-center gap-2">
          <span className="bn-body text-xs text-ink-muted">{labels.suggestionsLabel}</span>
          {state.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSlug(s)}
              className="min-h-[36px] rounded-full border border-border-strong bg-surface px-3 font-latin text-sm text-primary transition-colors duration-fast hover:bg-primary-weak"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <Field id={emailId} label={labels.emailLabel} error={state.errors?.email}>
        <input
          id={emailId}
          name="email"
          type="email"
          required
          defaultValue={state.values?.email}
          autoComplete="email"
          placeholder="you@example.com"
          className={inputClass(Boolean(state.errors?.email)) + " font-latin"}
          aria-invalid={Boolean(state.errors?.email)}
        />
      </Field>

      <Field
        id={passwordId}
        label={labels.passwordLabel}
        hint={labels.passwordHint}
        error={state.errors?.password}
      >
        <input
          id={passwordId}
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass(Boolean(state.errors?.password)) + " font-latin"}
          aria-invalid={Boolean(state.errors?.password)}
        />
      </Field>

      <SubmitButton label={labels.submit} pendingLabel={labels.submitting} />

      <p className="bn-body text-center text-xs text-ink-subtle">
        {labels.trialNote}
      </p>
    </form>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="bn-body mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="bn-body mt-1.5 text-xs text-ink-subtle">{hint}</p>
      ) : null}
      {error ? (
        <p role="alert" className="bn-body mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return [
    "min-h-[44px] w-full rounded-md border bg-surface px-3 text-base text-ink outline-none",
    "placeholder:text-ink-subtle",
    hasError ? "border-danger" : "border-border-strong",
  ].join(" ");
}
