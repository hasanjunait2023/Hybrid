import type { Metadata } from "next";
import { HybridLogo } from "@hybrid/ui";
import { getDict } from "@/lib/i18n/server";
import { LoginForm } from "./LoginForm";

// Email + password login (AUTH_PROVIDER=supabase: credentials verified against
// Supabase Auth / GoTrue). Reached on admin.* and app.* hosts — the middleware
// passes /login through untouched so it resolves as this top-level route. The
// dev-login route redirects here whenever AUTH_PROVIDER is not "dev".
export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDict();
  return { title: d.auth.login.metaTitle };
}

export default async function LoginPage() {
  const { d } = await getDict();
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <HybridLogo size="lg" className="mb-3" />
        <p className="mb-6 text-sm text-ink-muted">{d.auth.login.heading}</p>
        <LoginForm
          labels={{
            email: d.auth.login.emailLabel,
            password: d.auth.login.passwordLabel,
            submit: d.auth.login.submit,
            submitting: d.auth.login.submitting,
            invalidCredentials: d.auth.login.invalidCredentials,
            genericError: d.auth.login.genericError,
            divider: d.auth.login.divider,
            oauthGoogle: d.auth.login.oauthGoogle,
            oauthFacebook: d.auth.login.oauthFacebook,
            oauthFailed: d.auth.login.oauthFailed,
          }}
        />
      </div>
    </main>
  );
}
