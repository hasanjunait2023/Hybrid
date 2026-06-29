import { listTenants } from "@/lib/platform/data";

// Platform support ("Homies-Lab" skin). In-app ticketing is the next phase; for
// now this is the seller contact book so the operator can reach any store owner
// directly. Authz via the platform layout.
export const dynamic = "force-dynamic";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

export default async function PlatformSupport() {
  const tenants = await listTenants();
  const withEmail = tenants.filter((t) => t.ownerEmail);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] font-medium text-[var(--pf-muted)]">
        Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <span className="text-[var(--pf-ink)]">Support</span>
      </p>
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-[var(--pf-ink)]">Support</h1>
        <p className="mt-1 text-[13px] text-[var(--pf-muted)]">Reach any seller directly. In-app ticketing is coming next.</p>
      </div>

      <div className="rounded-2xl border border-dashed border-[var(--pf-border)] bg-[var(--pf-hover)] p-4 text-[12.5px] text-[var(--pf-muted)]">
        <span className="font-semibold text-[var(--pf-ink)]">Inbox coming soon.</span> Until then, use the seller contact book below to email store owners about billing, onboarding or issues.
      </div>

      <div className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4 lg:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[var(--pf-ink)]">Seller contacts</h2>
          <span className="rounded-full bg-[var(--pf-yellow-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--pf-yellow-deep)]">{withEmail.length} contacts</span>
        </div>
        {withEmail.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-[var(--pf-muted)]">No seller contacts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--pf-subtle)]">
                  <th className="pb-2.5 font-semibold">Store</th>
                  <th className="pb-2.5 font-semibold">Owner</th>
                  <th className="pb-2.5 font-semibold">Email</th>
                  <th className="pb-2.5 font-semibold">Status</th>
                  <th className="pb-2.5 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {withEmail.map((t) => (
                  <tr key={t.id} className="border-t border-[var(--pf-border)] align-middle">
                    <td className="py-3">
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--pf-yellow-soft)] text-[12px] font-bold text-[var(--pf-yellow-deep)]">
                          {t.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-[var(--pf-ink)]">{t.name}</span>
                          <span className="block font-mono text-[11px] text-[var(--pf-subtle)]">{t.slug}.{ROOT}</span>
                        </span>
                      </span>
                    </td>
                    <td className="py-3 text-[var(--pf-muted)]">{t.ownerName ?? "—"}</td>
                    <td className="py-3 font-mono text-[12px] text-[var(--pf-ink)]">{t.ownerEmail}</td>
                    <td className="py-3 capitalize text-[var(--pf-muted)]">{t.status.replace("_", " ")}</td>
                    <td className="py-3 text-right">
                      <a href={`mailto:${t.ownerEmail}`} className="rounded-lg border border-[var(--pf-border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--pf-ink)] hover:bg-[var(--pf-hover)]">
                        Email
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
