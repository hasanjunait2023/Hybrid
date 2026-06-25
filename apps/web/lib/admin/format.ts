// Small admin view helpers — relative time + slug generation. Relative time is
// locale-aware (digits + unit words follow the active locale).
import { toBnDigits } from "@hybrid/ui";
import type { Locale } from "@/lib/i18n/config";

const TIME_UNITS = {
  en: { now: "just now", min: "min ago", hr: "hr ago", day: "d ago", mon: "mo ago", yr: "y ago" },
  bn: { now: "এইমাত্র", min: "মিনিট আগে", hr: "ঘণ্টা আগে", day: "দিন আগে", mon: "মাস আগে", yr: "বছর আগে" },
} as const;

/** Locale-aware "time ago" for order/customer lists. */
export function timeAgo(iso: string, locale: Locale): string {
  const u = TIME_UNITS[locale];
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  const n = (value: number) => (locale === "bn" ? toBnDigits(value) : String(value));
  if (min < 1) return u.now;
  if (min < 60) return `${n(min)} ${u.min}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${n(hr)} ${u.hr}`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${n(day)} ${u.day}`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${n(mon)} ${u.mon}`;
  return `${n(Math.floor(mon / 12))} ${u.yr}`;
}

/** Bengali "time ago" — legacy wrapper; prefer timeAgo(iso, locale). */
export function timeAgoBn(iso: string): string {
  return timeAgo(iso, "bn");
}

/** Slugify a title for product/collection slugs. Keeps Bangla and Latin word
 * chars; collapses the rest to hyphens. Falls back to a timestamp suffix when a
 * title is all punctuation. DB unique constraint is the real guard. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    // keep latin, digits, hyphen, and Bangla block (U+0980–U+09FF)
    .replace(/[^a-z0-9ঀ-৿-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `item-${Date.now().toString(36)}`;
}
