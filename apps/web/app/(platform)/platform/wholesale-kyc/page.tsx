import Link from "next/link";
import { listPendingKycTenants } from "./actions";
import { KycActions } from "./KycActions";

// Super-admin Wholesale KYC approval queue (Phase 5). Lists every tenant with
// business_type = wholesale or both that hasn't been approved yet. Operators
// can approve (wholesale_approved=true, kyc_status='verified') or reject
// (kyc_status='rejected') from the list or drill into detail.
export const dynamic = "force-dynamic";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(new Date(iso));
}

function kycBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-[var(--pf-yellow-soft)] text-[var(--pf-yellow-deep)]",
    submitted: "bg-[var(--pf-blue-50)] text-[var(--pf-blue-700)]",
    verified: "bg-[var(--pf-green-50)] text-[var(--pf-success)]",
    rejected: "bg-[var(--pf-red-50)] text-[var(--pf-danger)]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
        map[status] ?? "bg-[var(--pf-surface-2)] text-[var(--pf-muted)]"
      }`}
    >
      {status}
    </span>
  );
}

export default async function WholesaleKycPage({
  searchParams,
}: {
  searchParams: Promise<{ kyc_status?: string }>;
}) {
  const sp = await searchParams;
  const filterStatus = sp.kyc_status ?? "";
  const all = await listPendingKycTenants();

  const filtered = filterStatus
    ? all.filter((t) => t.kycStatus === filterStatus)
    : all;

  const statusChips = [
    { label: "All", value: all.length, href: "/platform/wholesale-kyc", active: !filterStatus },
    { label: "Pending", value: all.filter((t) => t.kycStatus === "pending").length, href: "/platform/wholesale-kyc?kyc_status=pending", active: filterStatus === "pending" },
    { label: "Submitted", value: all.filter((t) => t.kycStatus === "submitted").length, href: "/platform/wholesale-kyc?kyc_status=submitted", active: filterStatus === "submitted" },
    { label: "Verified", value: all.filter((t) => t.kycStatus === "verified").length, href: "/platform/wholesale-kyc?kyc_status=verified", active: filterStatus === "verified" },
    { label: "Rejected", value: all.filter((t) => t.kycStatus === "rejected").length, href: "/platform/wholesale-kyc?kyc_status=rejected", active: filterStatus === "rejected" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-[var(--pf-muted)]">
          Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
          <span className="text-[var(--pf-ink)]">Wholesale KYC</span>
        </p>
        <span className="rounded-full bg-[var(--pf-yellow-soft)] px-2.5 py-1 text-[12px] font-semibold text-[var(--pf-yellow-deep)]">
          {filtered.length} pending
        </span>
      </div>

      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-[var(--pf-ink)]">
          Wholesale KYC Approval
        </h1>
        <p className="mt-1 text-[13px] text-[var(--pf-muted)]">
          Review and approve wholesale seller applications.
        </p>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {statusChips.map((chip) => (
          <Link
            key={chip.label}
            href={chip.href}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
              chip.active
                ? "bg-[var(--pf-black)] text-[var(--pf-surface-2)]"
                : "bg-[var(--pf-surface)] text-[var(--pf-muted)] hover:bg-[var(--pf-surface-2)]"
            }`}
          >
            {chip.label} ({chip.value})
          </Link>
        ))}
      </div>

      {/* KYC table */}
      <div className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-4 lg:p-5">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-[14px] text-[var(--pf-muted)]">
            No pending KYC applications.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--pf-subtle)]">
                  <th className="pb-2.5 font-semibold">Store</th>
                  <th className="pb-2.5 font-semibold">Owner</th>
                  <th className="pb-2.5 font-semibold">Type</th>
                  <th className="pb-2.5 font-semibold">KYC Status</th>
                  <th className="pb-2.5 font-semibold">Documents</th>
                  <th className="pb-2.5 font-semibold">Created</th>
                  <th className="pb-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {filtered.map((t) => (
                  <tr key={t.id} className="border-t border-[var(--pf-border)] align-middle">
                    <td className="py-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={t.name} />
                        <span className="min-w-0">
                          <Link
                            href={`/platform/wholesale-kyc/${t.id}`}
                            className="block font-semibold text-[var(--pf-ink)] hover:underline"
                          >
                            {t.name}
                          </Link>
                          <span className="block font-mono text-[11px] text-[var(--pf-subtle)]">
                            {t.slug}.{ROOT}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="py-3 text-[var(--pf-muted)]">
                      {t.ownerName ?? t.ownerEmail ?? "—"}
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center rounded-full bg-[var(--pf-surface-2)] px-2 py-0.5 text-[11px] font-semibold capitalize text-[var(--pf-muted)]">
                        {t.businessType}
                      </span>
                    </td>
                    <td className="py-3">{kycBadge(t.kycStatus)}</td>
                    <td className="py-3 font-mono text-[12px] text-[var(--pf-muted)]">
                      {t.kycDocumentsCount}
                    </td>
                    <td className="py-3 font-mono text-[12px] text-[var(--pf-muted)]">
                      {fmtDate(t.createdAt)}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end">
                        <KycActions tenantId={t.id} kycStatus={t.kycStatus} />
                      </div>
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

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pf-yellow-soft)] text-[12px] font-bold text-[var(--pf-yellow-deep)]">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
