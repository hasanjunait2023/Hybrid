// Tenant provisioning — the post-signup Server Action core (blueprint
// "apps/web shared cores" → lib/auth/provision.ts; research brief §3).
//
// A new seller signing up gets a live store in ONE atomic platform-admin
// transaction: tenant + its subdomain + the owner membership + a trialing
// subscription. Signup first creates the app_user row (the identity), then mints
// the matching GoTrue user under the live supabase provider, then calls
// provisionTenant with that app_user.id. (The earlier on_auth_user_created DB
// trigger / 05_auth.sql was dropped — app_user is created explicitly by the
// signup flow, not by a GoTrue insert trigger.)
//
// Runs via asPlatformAdmin (NOT withTenant): at provisioning time the tenant
// does not exist yet, and these are platform-level inserts across the tenant /
// tenant_domain / tenant_member / subscription tables. set_config in
// asPlatformAdmin flips app.is_platform_admin so the inserts pass RLS.
import { asPlatformAdmin } from "@hybrid/db";
import type { Tx } from "@hybrid/db";

// Trial length is a product decision (GATE-1: starter-level 14-day trial).
const TRIAL_DAYS = 14;
const STARTER_PLAN_CODE = "starter";

export interface ProvisionTenantInput {
  /** app_user.id of the owner. Must already exist (trigger or createAppUser). */
  userId: string;
  /** Display name of the store, e.g. "Rahim's Fashion". */
  storeName: string;
  /** Subdomain label, e.g. "rahim" → rahim.myhybrid.com. Must be unique. */
  slug: string;
  /** Plan code to start on. Defaults to the starter plan (GATE-1 default). */
  plan?: string;
}

export interface ProvisionTenantResult {
  tenantId: string;
  slug: string;
}

// Friendly Bengali error surfaced to the signup form when the chosen subdomain
// is already taken (caught from the tenant.slug / tenant_domain.domain unique
// violation). Carries a stable `code` so the FE can branch without string-matching.
export class SlugTakenError extends Error {
  readonly code = "SLUG_TAKEN" as const;
  readonly slug: string;
  constructor(slug: string) {
    super("এই সাবডোমেইনটি ইতিমধ্যে ব্যবহৃত হয়েছে। অন্য একটি নাম বেছে নিন।");
    this.name = "SlugTakenError";
    this.slug = slug;
  }
}

// Postgres unique_violation. Slug/domain collisions surface as this SQLSTATE;
// we translate it into the friendly Bengali SlugTakenError.
const PG_UNIQUE_VIOLATION = "23505";

function rootDomain(): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!root) {
    throw new Error("NEXT_PUBLIC_ROOT_DOMAIN is not set (required for provisioning)");
  }
  return root;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

// Result of createAppUser. `created` distinguishes a genuinely new identity from
// a match against a pre-existing email — the signup path MUST refuse to mint a
// session for an existing account (else signing up with a victim's email would
// hand the attacker a session for that pre-existing user = account takeover).
export interface CreateAppUserResult {
  userId: string;
  /** true → this call inserted a new app_user; false → matched an existing one. */
  created: boolean;
}

// Create a standalone app_user. Own auth (SHIFT 1) makes this the ONLY identity
// passwordHash. Idempotent on email so a retried signup matches the existing
// user instead of erroring; the `created` flag lets callers tell new-vs-existing
// apart (the signup action refuses the latter — account-takeover guard).
//
// passwordHash is optional so the dev-login path (no password) and a phone-only
// identity still work. On a matched (existing) row the hash is only overwritten
// when a new one is supplied (coalesce), so a re-run never clobbers a set
// password with null.
export async function createAppUser(input: {
  email: string;
  fullName?: string | null;
  phone?: string | null;
  passwordHash?: string | null;
}): Promise<CreateAppUserResult> {
  return asPlatformAdmin(async (tx) => {
    // xmax = 0 on the returned row iff the row was freshly inserted (no prior
    // tuple version); a non-zero xmax means the ON CONFLICT update path ran on
    // an existing row. This is the standard Postgres upsert created-vs-matched
    // discriminator and avoids a second round-trip.
    const rows = await tx<{ id: string; created: boolean }[]>`
      insert into app_user (email, full_name, phone, password_hash)
      values (
        ${input.email}, ${input.fullName ?? null}, ${input.phone ?? null},
        ${input.passwordHash ?? null}
      )
      on conflict (email) do update set
        full_name = coalesce(excluded.full_name, app_user.full_name),
        phone = coalesce(excluded.phone, app_user.phone),
        password_hash = coalesce(excluded.password_hash, app_user.password_hash),
        updated_at = now()
      returning id, (xmax = 0) as created
    `;
    const row = rows[0]!;
    return { userId: row.id, created: row.created };
  });
}

// Remove an app_user that was just created for a signup that then failed to
// provision a tenant (e.g. slug collision). Without this, the orphaned row would
// make a legitimate retry with the same email look "already used" (createAppUser
// would report created:false) — wrongly tripping the takeover guard. Only safe
// to call for a user with NO tenant membership; we scope the delete accordingly.
export async function deleteOwnerlessUser(userId: string): Promise<void> {
  await asPlatformAdmin(async (tx) => {
    await tx`
      delete from app_user
       where id = ${userId}
         and not exists (
           select 1 from tenant_member where user_id = ${userId}
         )
    `;
  });
}

export async function provisionTenant(
  input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
  const planCode = input.plan ?? STARTER_PLAN_CODE;
  const domain = `${input.slug}.${rootDomain()}`;

  try {
    return await asPlatformAdmin(async (tx) => {
      const planId = await resolvePlanId(tx, planCode);

      // (1) tenant — trial status, starter plan, 14-day trial, Bengali default.
      const tenantRows = await tx<{ id: string; slug: string }[]>`
        insert into tenant (
          slug, name, status, owner_user_id, plan_id, trial_ends_at, default_locale
        ) values (
          ${input.slug}, ${input.storeName}, 'trial', ${input.userId}, ${planId},
          now() + ${`${TRIAL_DAYS} days`}::interval, 'bn'
        )
        returning id, slug
      `;
      const tenant = tenantRows[0]!;

      // (2) subdomain — verified + primary so resolve.ts can route immediately
      // once the tenant goes active.
      await tx`
        insert into tenant_domain (tenant_id, domain, type, is_primary, verified)
        values (${tenant.id}, ${domain}, 'subdomain', true, true)
      `;

      // (3) owner membership — accepted now (self-signup, no invite step).
      await tx`
        insert into tenant_member (tenant_id, user_id, role, accepted_at)
        values (${tenant.id}, ${input.userId}, 'owner', now())
      `;

      // (4) subscription — trialing, 14-day window, manual billing (GATE-1).
      await tx`
        insert into subscription (
          tenant_id, plan_id, status,
          current_period_start, current_period_end, billing_provider
        ) values (
          ${tenant.id}, ${planId}, 'trialing',
          now(), now() + ${`${TRIAL_DAYS} days`}::interval, 'manual'
        )
      `;

      return { tenantId: tenant.id, slug: tenant.slug };
    });
  } catch (err: unknown) {
    // Slug or its derived domain collided → friendly Bengali error. The whole
    // transaction rolled back, so no partial tenant is left behind.
    if (isUniqueViolation(err)) {
      throw new SlugTakenError(input.slug);
    }
    throw err;
  }
}

async function resolvePlanId(tx: Tx, planCode: string): Promise<string> {
  const rows = await tx<{ id: string }[]>`
    select id from plan where code = ${planCode} limit 1
  `;
  const planId = rows[0]?.id;
  if (!planId) {
    throw new Error(`PLAN_NOT_FOUND:${planCode}`);
  }
  return planId;
}
