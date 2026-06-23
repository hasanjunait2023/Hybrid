// Super-admin authorization (blueprint S-PLATFORM).
//
// The middleware rewrites app.{root} -> /platform but does NOT gate by role
// (it can't read the DB cheaply at the edge). So /platform enforces its own
// authz here, reusing the SAME getSession() seam as /admin (no new auth path):
//   1. must have a session (dev cookie now, Supabase later — both via getSession)
//   2. that user must be app_user.is_platform_admin = true
//
// The is_platform_admin flag is the canonical super-admin marker (sql/03_seed.sql
// admin user; sql/02_policies.sql app.is_platform_admin()). The lookup spans no
// single tenant, so it runs under asPlatformAdmin.
import { asPlatformAdmin } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";

export interface PlatformAdmin {
  userId: string;
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const rows = await asPlatformAdmin((tx) =>
    tx<{ is_platform_admin: boolean }[]>`
      select is_platform_admin from app_user where id = ${userId} limit 1
    `,
  );
  return rows[0]?.is_platform_admin === true;
}

// Returns the platform admin identity, or null when the caller is not a
// super-admin. Pages/actions translate null into a redirect / friendly refusal.
export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  const session = await getSession();
  if (!session) return null;
  const ok = await isPlatformAdmin(session.userId);
  return ok ? { userId: session.userId } : null;
}
