"use client";

// Sandbox/live (or stage/live) mode switch + warning chip (DESIGN §Q4.1 step 2).
// Shared across the gateway/courier ProviderCards so the sandbox note reads
// identically everywhere. Honest: the warning is only shown in the test mode.
type Mode = "sandbox" | "live" | "stage";

const LABELS: Record<Mode, string> = {
  sandbox: "স্যান্ডবক্স",
  stage: "স্টেজ",
  live: "লাইভ",
};

export function ModeChip<M extends Exclude<Mode, never>>({
  mode,
  onChange,
  testValue,
}: {
  mode: M;
  onChange: (m: M) => void;
  /** The non-live value ("sandbox" or "stage"); defaults to "sandbox". */
  testValue?: M;
}) {
  const test = (testValue ?? ("sandbox" as M)) as M;
  const options = [test, "live" as M];
  const isTest = mode !== "live";

  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-ink">মোড</span>
      <div className="flex gap-2">
        {options.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={
              mode === m
                ? "rounded-md border-2 border-primary bg-primary-weak px-3 py-1.5 text-sm font-semibold text-primary"
                : "rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-2"
            }
          >
            {LABELS[m as Mode]}
          </button>
        ))}
      </div>
      {isTest && (
        <p className="rounded-md bg-warning-weak px-3 py-2 text-xs font-medium text-warning">
          ⚠ {LABELS[test as Mode]} মোড — পরীক্ষার জন্য। আসল পেমেন্ট/ডেলিভারির জন্য লাইভ মোডে আসল তথ্য দিন।
        </p>
      )}
    </div>
  );
}
