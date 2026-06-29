import Link from "next/link";
import { notFound } from "next/navigation";
import { getKycDetail, approveKyc, rejectKyc } from "../actions";
import { KycDetailActions } from "./KycDetailActions";

// KYC detail page — full view of one tenant's wholesale KYC application.
// Shows tenant info, uploaded documents, and approve/reject controls.
export const dynamic = "force-dynamic";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "myhybrid.com";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
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
    submitted: "bg-[#dbeafe] text-[#1d4ed8]",
    verified: "bg-[#e6f6ee] text-[var(--pf-success)]",
    rejected: "bg-[#fde9e8] text-[var(--pf-danger)]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
        map[status] ?? "bg-[#f0ede4] text-[var(--pf-muted)]"
      }`}
    >
      {status}
    </span>
  );
}

export default async function KycDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getKycDetail(id);
  if (!detail) notFound();

  return (
    <div className="flex flex-col gap-5">
      {/* Breadcrumb */}
      <p className="text-[13px] font-medium text-[var(--pf-muted)]">
        Home <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <Link href="/platform/wholesale-kyc" className="hover:text-[var(--pf-ink)]">
          Wholesale KYC
        </Link>
        <span className="px-1 text-[var(--pf-subtle)]">/</span>
        <span className="text-[var(--pf-ink)]">{detail.name}</span>
      </p>

      {/* Header card */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--pf-border)] bg-gradient-to-br from-[#fdf8ec] to-[#fbf3dc] p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--pf-yellow-soft)] text-[18px] font-bold text-[var(--pf-yellow-deep)]">
            {detail.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-tight text-[var(--pf-ink)]">
                {detail.name}
              </h1>
              {kycBadge(detail.kycStatus)}
            </div>
            <p className="mt-0.5 font-mono text-[12px] text-[var(--pf-subtle)]">
              {detail.slug}.{ROOT}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--pf-muted)]">
              Created: {fmtDate(detail.createdAt)}
            </p>
          </div>
        </div>
        <KycDetailActions
          tenantId={detail.id}
          kycStatus={detail.kycStatus}
          wholesaleApproved={detail.wholesaleApproved}
        />
      </div>

      {/* Tenant info card */}
      <section className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-5">
        <h2 className="mb-4 text-[14px] font-bold text-[var(--pf-ink)]">
          Tenant Information
        </h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Row label="Store Name" value={detail.name} />
          <Row label="Slug" value={detail.slug} mono />
          <Row label="Email" value={detail.email ?? "—"} />
          <Row label="Phone" value={detail.phone ?? "—"} />
          <Row label="Business Type" value={detail.businessType} />
          <Row label="Owner" value={detail.ownerName ?? detail.ownerEmail ?? "—"} />
          <Row label="KYC Status" value={detail.kycStatus} />
          <Row label="Wholesale Approved" value={detail.wholesaleApproved ? "Yes" : "No"} />
        </dl>
      </section>

      {/* KYC Documents card */}
      <section className="rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-panel)] p-5">
        <h2 className="mb-4 text-[14px] font-bold text-[var(--pf-ink)]">
          KYC Documents ({detail.kycDocuments.length})
        </h2>
        {detail.kycDocuments.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--pf-muted)]">
            No documents uploaded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] border-collapse text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-[var(--pf-subtle)]">
                  <th className="pb-2.5 font-semibold">Type</th>
                  <th className="pb-2.5 font-semibold">Status</th>
                  <th className="pb-2.5 font-semibold">Uploaded</th>
                  <th className="pb-2.5 font-semibold">Preview</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {detail.kycDocuments.map((doc, i) => (
                  <tr key={i} className="border-t border-[var(--pf-border)]">
                    <td className="py-3 font-medium capitalize text-[var(--pf-ink)]">
                      {doc.type?.replace(/_/g, " ") ?? `Document ${i + 1}`}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          doc.verified
                            ? "bg-[#e6f6ee] text-[var(--pf-success)]"
                            : "bg-[var(--pf-yellow-soft)] text-[var(--pf-yellow-deep)]"
                        }`}
                      >
                        {doc.verified ? "Verified" : "Pending"}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-[12px] text-[var(--pf-muted)]">
                      {doc.uploadedAt ? fmtDate(doc.uploadedAt) : "—"}
                    </td>
                    <td className="py-3">
                      {doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] font-semibold text-[var(--pf-yellow-deep)] hover:underline"
                        >
                          View →
                        </a>
                      ) : (
                        <span className="text-[var(--pf-subtle)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-[#fbf9f2] px-3 py-2.5">
      <dt className="text-[12px] text-[var(--pf-muted)]">{label}</dt>
      <dd
        className={`text-[13px] font-semibold text-[var(--pf-ink)] ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
