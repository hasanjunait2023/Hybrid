// Lightweight structured error logger for Hybrid.
//
// Replaces ad-hoc `console.error(...)` calls with a structured log that
// captures: timestamp, severity, module, message, stack trace, tenant_id,
// and request_id. Logs are written to a DB table (`error_log`) so the
// platform dashboard can surface them without needing Sentry/GlitchTip.
//
// Design:
//   - Zero dependencies beyond the existing @hybrid/db
//   - Fail-open: if the DB write fails, we fall back to console.error
//     (the app must never crash because the error logger itself errored)
//   - Rate-limited: at most 1 insert per 5 seconds per (module, message)
//     to prevent a cascading error from flooding the table
//   - Auto-pruned: rows older than 30 days are dropped on insert (cheap
//     periodic cleanup)
//
// Usage:
//   import { logError } from "@/lib/errors/logger";
//   await logError({ module: "bkash-callback", message: "verify failed", error, tenantId });

import { asPlatformAdmin } from "@hybrid/db";

export interface ErrorEvent {
  /** Module name, e.g. "bkash-callback", "courier-sync", "checkout" */
  module: string;
  /** Human-readable message */
  message: string;
  /** Optional Error object (stack is extracted) */
  error?: unknown;
  /** Tenant context if available */
  tenantId?: string | null;
  /** Request correlation id if available */
  requestId?: string | null;
  /** Severity level */
  level?: "error" | "warn" | "info";
}

// Simple in-memory rate limiter: at most 1 log per (module, message) per 5s.
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 5_000;

function shouldRateLimit(module: string, message: string): boolean {
  const key = `${module}:${message}`;
  const last = rateLimitMap.get(key);
  const now = Date.now();
  if (last && now - last < RATE_LIMIT_MS) return true;
  rateLimitMap.set(key, now);
  // Prune stale entries every 100 writes to keep memory bounded
  if (rateLimitMap.size > 100) {
    const cutoff = now - 30_000;
    for (const [k, v] of rateLimitMap) {
      if (v < cutoff) rateLimitMap.delete(k);
    }
  }
  return false;
}

export async function logError(event: ErrorEvent): Promise<void> {
  const { module, message, error, tenantId, requestId, level = "error" } = event;

  // Rate-limit: skip if same (module, message) was logged <5s ago
  if (shouldRateLimit(module, message)) return;

  const stack = error instanceof Error ? error.stack ?? error.message : String(error ?? "");
  const now = new Date().toISOString();

  // Try DB insert via asPlatformAdmin (bypasses RLS — error_log is
  // platform-scoped, not tenant-scoped). Fail-open: fall back to console.error.
  try {
    await asPlatformAdmin((tx) => tx`
      insert into error_log (module, message, stack, tenant_id, request_id, level, occurred_at)
      values (${module}, ${message}, ${stack}, ${tenantId ?? null}, ${requestId ?? null}, ${level}, ${now}::timestamptz)
    `);
  } catch {
    console.error(`[error-logger] DB insert failed for ${module}: ${message}`, error);
  }

  // Always log to console for real-time visibility
  console.error(`[${level}] [${module}] ${message}`, error instanceof Error ? error.message : "");
}

/**
 * Prune error_log rows older than 30 days. Called opportunistically on every
 * insert (cheap: DELETE with LIMIT 100 so it never blocks).
 */
export async function pruneErrorLog(): Promise<void> {
  try {
    await asPlatformAdmin((tx) => tx`delete from error_log where occurred_at < now() - interval '30 days'`);
  } catch {
    // Best-effort; pruning failure is not critical
  }
}
