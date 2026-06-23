// Subdomain (slug) validation — shared by the client form and the server action
// so the two never drift. A slug becomes {slug}.{NEXT_PUBLIC_ROOT_DOMAIN}, so it
// must be a safe DNS label: lowercase, [a-z0-9-], no leading/trailing/double
// hyphen, 3–30 chars. Reserved labels collide with platform/admin/app hosts and
// are rejected before we ever hit the DB.

export const SLUG_MIN = 3;
export const SLUG_MAX = 30;

// Hosts the router already owns (middleware.ts): admin.*, app.*, www.*, plus the
// internal rewrite target and obvious system labels. A seller can never take one.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "app",
  "www",
  "api",
  "platform",
  "dashboard",
  "static",
  "assets",
  "mail",
  "ftp",
  "store-not-found",
  "_sites",
  "hybrid",
]);

export type SlugError =
  | "EMPTY"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "INVALID_CHARS"
  | "BAD_HYPHEN"
  | "RESERVED";

// Friendly Bengali message per failure mode (DESIGN: errors are Bengali-first).
export const SLUG_ERROR_BN: Record<SlugError, string> = {
  EMPTY: "একটি ঠিকানা লিখুন।",
  TOO_SHORT: "ঠিকানা কমপক্ষে ৩ অক্ষরের হতে হবে।",
  TOO_LONG: "ঠিকানা ৩০ অক্ষরের বেশি হতে পারবে না।",
  INVALID_CHARS: "শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও হাইফেন (-) ব্যবহার করুন।",
  BAD_HYPHEN: "হাইফেন (-) শুরু বা শেষে বা পরপর দুটি ব্যবহার করা যাবে না।",
  RESERVED: "এই ঠিকানাটি সংরক্ষিত — অন্য একটি নাম বেছে নিন।",
};

// Best-effort normaliser used by the client as the user types: lowercase, spaces
// → hyphen, drop anything not [a-z0-9-]. NOT a validator — validateSlug is the
// gate. Kept deterministic so client preview === server domain.
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function validateSlug(slug: string): SlugError | null {
  if (slug.length === 0) return "EMPTY";
  if (slug.length < SLUG_MIN) return "TOO_SHORT";
  if (slug.length > SLUG_MAX) return "TOO_LONG";
  if (!/^[a-z0-9-]+$/.test(slug)) return "INVALID_CHARS";
  if (slug.startsWith("-") || slug.endsWith("-") || slug.includes("--")) {
    return "BAD_HYPHEN";
  }
  if (RESERVED_SLUGS.has(slug)) return "RESERVED";
  return null;
}

// Alternative-slug suggestions shown when a slug is already taken. Deterministic,
// derived from the user's own choice so the suggestions feel related (rahim →
// rahim-bd, rahim-store, rahim-shop). Filters out reserved/invalid candidates.
export function suggestSlugs(base: string): string[] {
  const root = normalizeSlug(base).replace(/-+$/g, "") || "shop";
  const suffixes = ["bd", "store", "shop", "online", "hybrid"];
  const out: string[] = [];
  for (const suffix of suffixes) {
    const candidate = `${root}-${suffix}`.slice(0, SLUG_MAX);
    if (validateSlug(candidate) === null) out.push(candidate);
    if (out.length >= 3) break;
  }
  return out;
}
