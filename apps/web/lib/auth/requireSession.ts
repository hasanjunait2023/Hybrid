import { redirect } from "next/navigation";
import { getSession, type Session } from "./session";

// Hardens every auth-gated admin/platform/marketplace/wholesale page.
//
// BEFORE: 63 pages hardcoded `redirect("/dev-login?as=owner-a")` — leaking the
// dev route URL into production responses. If anyone set ALLOW_DEV_LOGIN=true
// in prod, the redirect target would mint an owner-a session for free.
//
// AFTER: this helper. In local dev (AUTH_PROVIDER=dev OR unset) we keep the
// old dev-login redirect behavior so contributors don't have to spin up
// Supabase. In production (any other AUTH_PROVIDER, including "supabase" or
// "password") we redirect to the real /login page with a `next=` param so the
// user lands back where they started after signing in.
//
// Usage:
//   const session = await requireSession();
//   const tenantId = await getActiveTenantId(session.userId);
//   const guard = await requireTenant();
//   if (!guard.ok) redirect(guard.redirect);

function isLocalAuthMode(): boolean {
  const provider = process.env.AUTH_PROVIDER;
  // No provider (env not set) = local default = dev cookie.
  // Explicit "dev" = dev cookie.
  return !provider || provider === "dev";
}

export async function requireSession(
  returnTo?: string,
): Promise<Session> {
  const session = await getSession();
  if (session) return session;

  if (isLocalAuthMode()) {
    // Local dev: keep the dev-login fast-lane so contributors don't need
    // external services. The dev-login route refuses in production.
    redirect(returnTo ? `/dev-login?as=owner-a&next=${encodeURIComponent(returnTo)}` : "/dev-login?as=owner-a");
  }

  // Production: redirect to the real login with a next= param so the user
  // lands back where they tried to go after signing in. Use the current
  // request's path (relative URL, safe — Next.js rejects absolute URLs).
  const next = returnTo ?? "/admin";
  redirect(`/login?next=${encodeURIComponent(next)}`);
}