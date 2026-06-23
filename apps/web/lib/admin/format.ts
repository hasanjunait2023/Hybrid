// Small admin view helpers — Bengali relative time + slug generation. Admin is
// operator-facing so numerals stay Latin (DESIGN §4.4); these labels are Bangla
// words around Latin numbers.

/** Bengali "time ago" for order/customer lists. Keeps numbers Latin. */
export function timeAgoBn(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "এইমাত্র";
  if (min < 60) return `${min} মিনিট আগে`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ঘণ্টা আগে`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} দিন আগে`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon} মাস আগে`;
  return `${Math.floor(mon / 12)} বছর আগে`;
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
