import "server-only";

// Marketplace buyer session (M2). A unified shopper identity that spans vendors,
// completely separate from the seller/staff app_user + hybrid_session world.
//
// Mirrors the own-auth opaque-session design (lib/auth/session.ts password path):
// an opaque base64url(randomBytes(32)) token in the cookie; only its SHA-256 hash
// is stored in marketplace_session. The cookie -> buyer_id lookup runs via
// asPlatformAdmin (the buyer isn't known yet, so it can't run under withBuyer —
// the exact same chicken/egg as getPasswordSession). Every subsequent buyer data
// access then uses withBuyer(buyerId, ...) so RLS stays sacred.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { asPlatformAdmin } from "@hybrid/db";

export const BUYER_SESSION_COOKIE = "hybrid_bazar_session";

const DEFAULT_SESSION_MAX_AGE_SECONDS = 604800; // 7 days

function sessionMaxAgeSeconds(): number {
  const raw = process.env.SESSION_MAX_AGE_SECONDS;
  if (!raw) return DEFAULT_SESSION_MAX_AGE_SECONDS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_SESSION_MAX_AGE_SECONDS;
}

// Cookie on the parent domain (.{ROOT}) so it rides the bazar.* subdomain. In dev
// (lvh.me) we omit domain so the host-only cookie still works locally.
function sessionCookieDomain(): string | undefined {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!root || root.includes("lvh.me") || root.includes("localhost")) return undefined;
  return `.${root}`;
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface BuyerSession {
  buyerId: string;
}

export interface SessionRequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

// Resolve the live (unexpired, unrevoked) buyer session from the cookie.
// Fail-closed on any miss. Lookup spans buyers → asPlatformAdmin (same rationale
// as getPasswordSession); it returns ONLY the buyer_id.
export async function getBuyerSession(): Promise<BuyerSession | null> {
  const store = await cookies();
  const raw = store.get(BUYER_SESSION_COOKIE)?.value;
  if (!raw) return null;

  const rows = await asPlatformAdmin((tx) =>
    tx<{ buyer_id: string }[]>`
      select buyer_id
        from marketplace_session
       where token_hash = ${hashToken(raw)}
         and revoked_at is null
         and expires_at > now()
       limit 1
    `,
  );
  const buyerId = rows[0]?.buyer_id;
  return buyerId ? { buyerId } : null;
}

// Find-or-create a buyer by phone (BD natural key). Runs via asPlatformAdmin —
// signup/login precede any buyer context. Updates the name on return visits.
export async function upsertBuyerByPhone(
  phone: string,
  name?: string | null,
): Promise<string> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ id: string }[]>`
      insert into marketplace_customer (phone, name)
      values (${phone}, ${name ?? null})
      on conflict (phone) do update set
        name = coalesce(excluded.name, marketplace_customer.name),
        updated_at = now()
      returning id
    `,
  );
  return rows[0]!.id;
}

// Mint a new opaque buyer session, persist its hash, set the cookie, return raw.
export async function createBuyerSession(
  buyerId: string,
  meta: SessionRequestMeta = {},
): Promise<string> {
  const rawToken = randomBytes(32).toString("base64url"); // 256 bits
  const tokenHash = hashToken(rawToken);
  const maxAge = sessionMaxAgeSeconds();

  await asPlatformAdmin(async (tx) => {
    await tx`
      insert into marketplace_session (buyer_id, token_hash, expires_at, ip, user_agent)
      values (
        ${buyerId}, ${tokenHash},
        now() + ${`${maxAge} seconds`}::interval,
        ${meta.ip ?? null}, ${meta.userAgent ?? null}
      )
    `;
  });

  const store = await cookies();
  store.set(BUYER_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
    domain: sessionCookieDomain(),
  });

  return rawToken;
}

// Revoke a buyer session by raw token (kept for audit; lookup filters revoked_at).
export async function revokeBuyerSession(rawToken: string): Promise<void> {
  if (!rawToken) return;
  await asPlatformAdmin(async (tx) => {
    await tx`
      update marketplace_session set revoked_at = now()
       where token_hash = ${hashToken(rawToken)} and revoked_at is null
    `;
  });
}

// Clear the cookie + revoke the row (logout).
export async function destroyBuyerSession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(BUYER_SESSION_COOKIE)?.value;
  if (raw) await revokeBuyerSession(raw);
  store.set(BUYER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    domain: sessionCookieDomain(),
  });
}
