"use client";

// TestConnectionButton — async credential test with four EXPLICIT visual states
// (DESIGN §Q4): idle · testing · success · fail-with-reason. Distinct from a
// generic submit because the RESULT is the point — a seller must see proof the
// creds work before trusting a payment/courier rail. The reason string on
// failure is server-derived (never a generic "failed").
import { useState } from "react";
import { cn } from "../lib/cn";

export type TestConnectionResult = {
  ok: boolean;
  /** Bengali message: success detail ("✓ টোকেন পাওয়া গেছে") or the actual reason. */
  message: string;
};

type Props = {
  /** Runs the server-side test action; returns ok + a Bengali message. */
  onTest: () => Promise<TestConnectionResult>;
  /** Disable when the provider isn't configured/enabled yet. */
  disabled?: boolean;
  label?: string;
};

type State =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "success"; message: string }
  | { kind: "fail"; message: string };

export function TestConnectionButton({
  onTest,
  disabled = false,
  label = "সংযোগ পরীক্ষা করুন",
}: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run(): Promise<void> {
    setState({ kind: "testing" });
    try {
      const result = await onTest();
      setState(
        result.ok
          ? { kind: "success", message: result.message }
          : { kind: "fail", message: result.message },
      );
    } catch {
      setState({ kind: "fail", message: "নেটওয়ার্ক সমস্যা — আবার চেষ্টা করুন।" });
    }
  }

  const testing = state.kind === "testing";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={disabled || testing}
        className={cn(
          "inline-flex min-h-[44px] items-center gap-2 rounded-sm border border-border-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          (disabled || testing) && "cursor-not-allowed opacity-60",
        )}
      >
        {testing && (
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-ink-subtle border-t-transparent"
          />
        )}
        {testing ? "পরীক্ষা চলছে…" : label}
      </button>

      {state.kind === "success" && (
        <p role="status" className="rounded-md bg-success-weak px-3 py-2 text-sm font-medium text-success">
          {state.message}
        </p>
      )}
      {state.kind === "fail" && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}
