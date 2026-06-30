import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { listIntegrations } from "@/lib/integrations/data";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  active: "সক্রিয়",
  pending: "মুলতবি",
  paused: "বিরতি",
  error: "ত্রুটি",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-success/10 text-success",
  pending: "bg-yellow-100 text-yellow-700",
  paused: "bg-surface-2 text-ink-muted",
  error: "bg-error/10 text-error",
};

const PLATFORM_ICONS: Record<string, string> = {
  shopify: "🛍️",
  woocommerce: "🛒",
  custom_api: "⚡",
  webhook_only: "🔔",
};

export default async function IntegrationsPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect("/dev-login");

  const integrations = await listIntegrations(session.tenantId, session.userId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">ইন্টিগ্রেশন</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            আপনার বাইরের স্টোর বা ওয়েবসাইট Hybrid-এ সংযুক্ত করুন।
          </p>
        </div>
        <Link
          href="/admin/integrations/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          + নতুন সংযোগ
        </Link>
      </div>

      {integrations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-2xl">🔗</p>
          <p className="mt-2 font-medium text-ink">এখনো কোনো ইন্টিগ্রেশন নেই</p>
          <p className="mt-1 text-sm text-ink-muted">
            Shopify, WooCommerce বা কাস্টম API দিয়ে আপনার সাইট সংযুক্ত করুন।
          </p>
          <Link
            href="/admin/integrations/new"
            className="mt-4 inline-block rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white"
          >
            ইন্টিগ্রেশন যোগ করুন
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {integrations.map((integration) => (
            <li key={integration.id}>
              <Link
                href={`/admin/integrations/${integration.id}`}
                className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm hover:border-primary/40 hover:shadow-md transition-all"
              >
                <span className="text-2xl">
                  {PLATFORM_ICONS[integration.platform] ?? "🔌"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink truncate">{integration.displayName}</p>
                  <p className="text-xs text-ink-muted capitalize">{integration.platform}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[integration.status] ?? ""}`}>
                    {STATUS_LABELS[integration.status] ?? integration.status}
                  </span>
                  {integration.lastSyncedAt && (
                    <span className="text-xs text-ink-muted">
                      {new Date(integration.lastSyncedAt).toLocaleDateString("bn-BD")}
                    </span>
                  )}
                </div>
                <span className="text-ink-muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
