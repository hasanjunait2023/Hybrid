// Microsoft Clarity integration (Phase D / TRACK-V2-D5).
//
// Clarity is a free heatmap + session-replay tool. It's "analytics-
// adjacent" (cookies + session recording) so it sits behind the
// `analytics` consent category — NOT `marketing`.
//
// Clarity's loader pattern is a tiny inline script that creates
// a <script src="https://www.clarity.ms/tag/{projectId}"> child
// and queues events on `window.clarity(...)`. We don't ship the
// official snippet inline (it changes often) — we render the
// async script tag at the same time the rest of the analytics
// stack loads.
export const CLARITY_SCRIPT_BASE = "https://www.clarity.ms/tag";

/** Build the script src URL for a Clarity project. */
export function clarityScriptUrl(projectId: string | null | undefined): string | null {
  if (!projectId) return null;
  // Defensive: Clarity project IDs are alphanumeric; reject anything
  // that looks like a URL injection / quote-escape attempt.
  if (!/^[a-z0-9]{6,32}$/i.test(projectId)) return null;
  return `${CLARITY_SCRIPT_BASE}/${projectId}`;
}

/**
 * Inject the Clarity snippet. Safe to call multiple times — the
 * browser dedupes script tags by src. No-ops under SSR.
 *
 * IMPORTANT: the caller is responsible for the consent gate. We do
 * NOT consult hasConsent() here because both the server-rendered
 * tracker (which gets consent as a prop) and the consent banner
 * (which only calls this AFTER grant) want the same behavior.
 */
export function loadClarity(projectId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const url = clarityScriptUrl(projectId);
  if (!url) return;
  // Idempotent — Clarity's loader is itself a dedup-by-src bootstrap,
  // but a second <script> is wasted bandwidth. Skip if already added.
  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-clarity-project="${CSS.escape(projectId!)}"]`,
  );
  if (existing) return;

  // Modern Clarity (v0.7+) supports the <script src> pattern; older
  // versions used a JSON config endpoint. We use the <script src>
  // pattern that the official docs recommend.
  const s = document.createElement("script");
  s.async = true;
  s.src = url;
  s.dataset.clarityProject = projectId!;
  document.head.appendChild(s);
}
