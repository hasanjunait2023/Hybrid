// OAuth session mint. Called from app/auth/callback/route.ts after
// Supabase GoTrue exchanges the provider `code` for a session. We:
//   1. Upsert an app_user row keyed on the verified email.
//   2. Mint our own opaque hybrid_session cookie (same as password login).
//
// Lives in its own module to avoid circular imports with provision.ts
// (createAppUser) and session.ts (createSession) — both of which this
// helper composes.

import { createAppUser } from "./provision";
import { createSession } from "./session";

type SupabaseSessionLike = {
  user: {
    id: string;
    email?: string | null;
    user_metadata?: {
      full_name?: string | null;
      name?: string | null;
      avatar_url?: string | null;
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