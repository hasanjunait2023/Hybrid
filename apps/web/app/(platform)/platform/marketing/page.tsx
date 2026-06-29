import { getPlatformStats } from "@/lib/platform/analytics";

// Platform marketing overview ("Homies-Lab" skin). Acquisition snapshot from the
// signup data we already have, plus channel cards (attribution wiring is the next
// phase). Authz via the platform layout.
export const dynamic = "force-dynamic";

export default async function PlatformMarketing() {
  const s = await getPlatformStats();
  const convBase = s.tenants.active + s.tenants.trial;
  const conversion = convBase > 0 ? Math.round((s.tenants.active / convBase) * 100) : 0;

  const stats = [
    { label: "Signups (30d)", value: String(s.signups30d), hint: "New stores" },
    { label: "Live stores", value: String(s.liveStores), hint: "Active + trial" },
    { label: "Trial → Paid", value: `${conversion}%`, hint: "Conversion", accent: true },
  ];

  const channels = [
    { name: "Organic", desc: "Direct + search signups", soon: true },
    { name: "Referral", desc: "Seller invites & word of mouth", soon: true },
    { name: "Paid", desc: "Ads & campaign attribution", soon: true },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] font-medium text-[var(--pf-muted)]">
        Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <span className="text-[var(--pf-ink)]">Marketing</span>
      </p>
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-[var(--pf-ink)]">Marketing</h1>
        <p className="mt-1 text-[13px] text-[var(--pf-muted)]">How new sellers find and join Hybrid.</p>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((st) => (
          <div key={st.label} className={`rounded-2xl border p-4 ${st.accent ? "border-[var(--pf-yellow)] bg-gradient-to-br from-[var(--pf-grad-gold-1)] to-[var(--pf-grad-gold-2)]" : "border-[var(--pf-border)] bg-[var(--pf-panel)]"}`}>
            <p className="text-[26px] font-bold leading-none text-[var(--pf-ink)]">{st.value}</p>
            <p className="mt-1.5 text-[12.5px] font-semibold text-[var(--pf-ink)]">{st.label}</p>
            <p className="mt-0.5 text-[11px] text-[var(--pf-muted)]">{st.hint}</p>
          </div>
        ))}
      </section>

      <div className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4 lg:p-5">
        <h2 className="text-[15px] font-bold text-[var(--pf-ink)]">Acquisition channels</h2>
        <p className="mt-0.5 text-[12px] text-[var(--pf-muted)]">Per-channel attribution lands in the next phase — tracking is being wired up.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {channels.map((c) => (
            <div key={c.name} className="rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-hover)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-bold text-[var(--pf-ink)]">{c.name}</span>
                {c.soon && (
                  <span className="rounded-full bg-[var(--pf-yellow-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--pf-yellow-deep)]">Soon</span>
                )}
              </div>
              <p className="mt-2 text-[20px] font-bold leading-none text-[var(--pf-subtle)]">—</p>
              <p className="mt-2 text-[11px] text-[var(--pf-muted)]">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
