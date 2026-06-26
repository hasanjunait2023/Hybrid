// OAuth session mint. Called from app/auth/callback/route.ts after
// Supabase GoTrue exchanges the provider `code` for a session. We:
//   1. Upsert an app_user row keyed on the verified email.
//   2. Mint our own opaque hybrid_session cookie (same as password login).
//
// Lives in its own module to avoid circular imports with provision.ts
// (createAppUser) and session.ts (createSession) — both of which this
// helper composes.

import { asPlatformAdmin } from "@hybrid/db";
import { createAppUser } from "./provision";
import { createSession } from "./session";

type SupabaseSessionLike = {
  user: {
    id: string;
    email?: string | null;
    /** GoTrue sets this when the provider's email is confirmed/verified. */
    email_confirmed_at?: string | null;
    user_metadata?: {
      full_name?: string | null;
      name?: string | null;
      avatar_url?: string | null;
      email_verified?: boolean | null;
    };
  };
};

export async function mintSessionFromSupabase(
  session: SupabaseSessionLike,
): Promise<void> {
  const email = session.user.email;
  if (!email) {
    throw new Error("OAuth session has no email — cannot provision app_user");
  }

  // SECURITY (account takeover via unverified email): only trust an email the
  // provider actually verified. Without this, an OAuth provider that lets a user
  // set an arbitrary unverified email could mint a session for someone else's
  // address.
  const emailVerified =
    Boolean(session.user.email_confirmed_at) ||
    session.user.user_metadata?.email_verified === true;
  if (!emailVerified) {
    throw new Error("OAuth provider did not verify the email — sign-in refused");
  }

  // SECURITY (account takeover via silent merge): createAppUser upserts on
  // email, so an OAuth sign-in with a victim's email would otherwise resolve to
  // — and mint a session for — their pre-existing PASSWORD account. Refuse to
  // auto-link OAuth into a password account; linking must be an explicit,
  // authenticated action. A pre-existing OAuth-only row (no password) is the
  // same person returning, so that is allowed.
  const existing = await asPlatformAdmin((tx) =>
    tx<{ has_password: boolean }[]>`
      select (password_hash is not null) as has_password
      from app_user
      where email = ${email}
      limit 1
    `,
  );
  if (existing[0]?.has_password) {
    throw new Error(
      "ACCOUNT_EXISTS_PASSWORD: an account with this email already uses a password — sign in with your password to link OAuth",
    );
  }

  const fullName =
    session.user.user_metadata?.full_name ??
    session.user.user_metadata?.name ??
    null;

  const { userId } = await createAppUser({
    email,
    fullName,
    phone: null,
    passwordHash: null, // OAuth users have no password
  });

  await createSession(userId, {
    ip: null,
    userAgent: null,
  });
}