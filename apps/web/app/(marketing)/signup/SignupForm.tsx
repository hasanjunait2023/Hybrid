"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@hybrid/ui";
import { oauthStartUrl, defaultPostLoginNext } from "@/lib/auth/oauthStartUrl";
import { signupAction, type SignupState } from "./actions";
import { normalizeSlug, validateSlug, SLUG_ERROR_BN } from "./slug";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

const INITIAL: SignupState = {};

interface SignupLabels {
  typeLabel: string;
  typeRetailer: string;
  typeRetailerHint: string;
  typeWholesaler: string;
  typeWholesalerHint: string;
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
  oauthGoogle?: string;
  oauthFacebook?: string;
  oauthDivider?: string;
}

// Labels are resolved server-side (cookie locale) and passed in, so the form
// follows the active language without a client LocaleProvider in this route.
export function SignupForm({ labels }: { labels: SignupLabels }) {
  const [state, formAction] = useActionState(signupAction, INITIAL);
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [businessType, setBusinessType] = useState<"retail" | "wholesale">(
    state.values?.businessType ?? "retail",
  );

  // Cross-host redirect (apex → admin.{ROOT}) must happen client-side; a Server
  // Action redirect() can't switch hosts. We navigate once the action succeeds.
  useEffect(() => {
    if (state.ok && state.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state.ok, state.redirectTo]);

  const next =
    typeof window !== "undefined"
      ? defaultPostLoginNext(window.location.host)
      : "/";

  function startOAuth(provider: "google" | "facebook") {
    window.location.assign(oauthStartUrl(provider, next));
  }

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

      {/* OAuth — primary path on mobile (no typing) */}
      {(labels.oauthGoogle || labels.oauthFacebook) && (
        <div className="flex flex-col gap-2">
          {labels.oauthGoogle ? (
            <button
              type="button"
              onClick={() => startOAuth("google")}
              className="flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 font-semibold text-ink hover:bg-bg"
            >
              <GoogleG size={18} />
              {labels.oauthGoogle}
            </button>
          ) : null}
          {labels.oauthFacebook ? (
            <button
              type="button"
              onClick={() => startOAuth("facebook")}
              className="flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 font-semibold text-ink hover:bg-bg"
            >
              <FacebookF size={18} />
              {labels.oauthFacebook}
            </button>
          ) : null}

          {labels.oauthDivider ? (
            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-ink-muted">
              <span className="h-px flex-1 bg-border" />
              <span>{labels.oauthDivider}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          ) : null}
        </div>
      )}

      {/* Store type — seller self-selects retailer vs wholesaler. The hidden
          input carries the choice to the Server Action; the cards toggle it. */}
      <input type="hidden" name="businessType" value={businessType} />
      <fieldset>
        <legend className="bn-body mb-1.5 block text-sm font-semibold text-ink">
          {labels.typeLabel}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <TypeCard
            selected={businessType === "retail"}
            title={labels.typeRetailer}
            hint={labels.typeRetailerHint}
            onSelect={() => setBusinessType("retail")}
          />
          <TypeCard
            selected={businessType === "wholesale"}
            title={labels.typeWholesaler}
            hint={labels.typeWholesalerHint}
            onSelect={() => setBusinessType("wholesale")}
          />
        </div>
      </fieldset>

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

function TypeCard({
  selected,
  title,
  hint,
  onSelect,
}: {
  selected: boolean;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "flex min-h-[44px] flex-col items-start gap-0.5 rounded-md border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-primary bg-primary-weak"
          : "border-border-strong bg-surface hover:bg-surface-2",
      ].join(" ")}
    >
      <span className="bn-body text-sm font-semibold text-ink">{title}</span>
      <span className="bn-body text-xs text-ink-muted">{hint}</span>
    </button>
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

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107" // eslint-disable-line hybrid/no-hardcoded-color
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00" // eslint-disable-line hybrid/no-hardcoded-color
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12.5 24 12.5c3 0 5.7 1.1 7.8 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5c-7.7 0-14.3 4.4-17.7 10.2z"
      />
      <path
        fill="#4CAF50" // eslint-disable-line hybrid/no-hardcoded-color
        d="M24 43.5c5 0 9.5-1.9 12.9-5l-6-4.9c-1.9 1.4-4.3 2.2-6.9 2.2-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.1 16.2 43.5 24 43.5z"
      />
      <path
        fill="#1976D2" // eslint-disable-line hybrid/no-hardcoded-color
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.4 5.5l6 4.9c-.4.4 6.5-4.7 6.5-14.4 0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function FacebookF({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2" // eslint-disable-line hybrid/no-hardcoded-color
        d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.875V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12z"
      />
    </svg>
  );
}
