import { notFound, redirect } from "next/navigation";
import { withTenant } from "@hybrid/db";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getStoreProfile } from "@/lib/admin/settings";
import { getDict } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/i18n/format";
import { PrintTrigger } from "../../../../orders/[id]/print/PrintTrigger";

// Wholesale B2B document export (Phase 5 §9 "cash memo, challan, invoice"). One
// print-only layout, three doc types via ?doc=:
//   * cashmemo (default) — priced ক্যাশ মেমো with totals + credit due
//   * invoice             — ট্যাক্স ইনভয়েস, BIN/VAT block surfaced for trade
//   * challan             — ডেলিভারি চালান, quantities only (no prices), recipient large
// Black-on-white, Latin numerals for amounts (admin/trade convention), Bengali
// labels (the buyer reads the cash memo). Reuses the orders print CSS island.
type DocType = "cashmemo" | "invoice" | "challan";

const DOC_LABELS: Record<DocType, string> = {
  cashmemo: "ক্যাশ মেমো",
  invoice: "ট্যাক্স ইনভয়েস",
  challan: "ডেলিভারি চালান",
};

function normalizeDoc(raw: string | undefined): DocType {
  return raw === "invoice" || raw === "challan" ? raw : "cashmemo";
}

interface PrintPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string }>;
}

interface ShippingAddress {
  recipient?: string;
  phone?: string;
  division?: string;
  district?: string;
  thana?: string;
  line?: string;
}

export default async function WholesaleOrderPrintPage({ params, searchParams }: PrintPageProps) {
  const { id } = await params;
  const doc = normalizeDoc((await searchParams).doc);
  const showPrices = doc !== "challan";

  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const order = await withTenant(tenantId, session.userId, async (tx) => {
    const rows = await tx<
      {
        id: string;
        order_number: string;
        customer_name: string | null;
        customer_phone: string | null;
        subtotal: string;
        discount_total: string;
        shipping_total: string;
        grand_total: string;
        credit_due: string;
        po_reference: string | null;
        payment_status: string;
        placed_at: string;
        shipping_address: ShippingAddress | null;
        business_name: string | null;
        trade_license_no: string | null;
        bin_no: string | null;
        current_due: string | null;
      }[]
    >`
      select o.id, o.order_number, o.customer_name, o.customer_phone,
             o.subtotal, o.discount_total, o.shipping_total, o.grand_total,
             o.credit_due, o.po_reference, o.payment_status, o.placed_at,
             o.shipping_address,
             c.business_name, c.trade_license_no, c.bin_no, c.current_due
        from orders o
        left join customer c on c.id = o.customer_id
       where o.id = ${id}
         and o.tenant_id = ${tenantId}
         and o.order_mode = 'wholesale'
       limit 1
    `;
    if (!rows[0]) return null;

    const items = await tx<
      { title: string; sku: string | null; unit_price: string; quantity: number; line_total: string }[]
    >`
      select title, sku, unit_price, quantity, line_total
        from order_item
       where order_id = ${id} and tenant_id = ${tenantId}
       order by id
    `;
    return { ...rows[0], items };
  });

  if (!order) notFound();

  // The document is the seller's trade paper → brand with the STORE (white-label).
  const profile = await getStoreProfile(tenantId, session.userId);
  const { locale } = await getDict();

  const addr = order.shipping_address ?? {};
  const addressLine = [addr.line, addr.thana, addr.district, addr.division].filter(Boolean).join(", ");
  const creditDue = Number(order.credit_due);
  const grandTotal = Number(order.grand_total);
  const paidNow = Math.max(0, grandTotal - creditDue);

  return (
    <div className="print-doc mx-auto max-w-[760px] bg-white p-6 text-black">
      <PrintTrigger />

      {/* Screen-only controls (hidden in print) */}
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <a
          href={`/admin/wholesale/orders/${order.id}`}
          className="text-sm text-ink-muted hover:text-primary"
        >
          ← অর্ডারে ফিরে যান
        </a>
        <div className="flex items-center gap-2 text-xs">
          {(["cashmemo", "invoice", "challan"] as DocType[]).map((dt) => (
            <a
              key={dt}
              href={`/admin/wholesale/orders/${order.id}/print?doc=${dt}`}
              className={
                dt === doc
                  ? "rounded-md bg-primary px-3 py-1.5 font-semibold text-white"
                  : "rounded-md border border-border px-3 py-1.5 text-ink-muted hover:text-primary"
              }
            >
              {DOC_LABELS[dt]}
            </a>
          ))}
          <button
            type="button"
            data-print-button
            className="h-8 rounded-md bg-ink px-4 font-semibold text-white"
          >
            প্রিন্ট
          </button>
        </div>
      </div>

      {/* Seller header */}
      <header className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <p className="text-lg font-bold leading-tight">{profile.name || "—"}</p>
          {profile.address && <p className="text-xs text-black/70">{profile.address}</p>}
          {profile.phone && <p className="font-mono text-xs">{profile.phone}</p>}
          {profile.vatBin && <p className="font-mono text-xs">BIN/VAT: {profile.vatBin}</p>}
        </div>
        <div className="text-right">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-black/60">
            {DOC_LABELS[doc]}
          </h1>
          <p className="font-mono text-sm">#{order.order_number}</p>
          <p className="font-mono text-xs">{formatDate(order.placed_at)}</p>
          {order.po_reference && (
            <p className="font-mono text-xs">PO: {order.po_reference}</p>
          )}
        </div>
      </header>

      {/* Buyer (B2B) block */}
      <section className="mt-4 text-sm">
        <p className="text-xs font-bold uppercase">ক্রেতা</p>
        <p className={doc === "challan" ? "text-lg font-bold" : "font-semibold"}>
          {order.business_name || addr.recipient || order.customer_name || "—"}
        </p>
        {order.business_name && (order.customer_name || addr.recipient) && (
          <p>{addr.recipient || order.customer_name}</p>
        )}
        <p className="font-mono">{addr.phone || order.customer_phone || "—"}</p>
        {addressLine && <p>{addressLine}</p>}
        <div className="mt-1 flex flex-wrap gap-x-4 font-mono text-xs text-black/70">
          {order.trade_license_no && <span>Trade Lic: {order.trade_license_no}</span>}
          {order.bin_no && <span>BIN: {order.bin_no}</span>}
        </div>
      </section>

      {/* Line items */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 pr-2 font-bold">পণ্য</th>
            <th className="w-12 py-1 text-center font-bold">পরিমাণ</th>
            {showPrices && <th className="py-1 text-right font-bold">দর</th>}
            {showPrices && <th className="py-1 text-right font-bold">মোট</th>}
            {!showPrices && <th className="w-16 py-1 text-center font-bold">✓</th>}
          </tr>
        </thead>
        <tbody>
          {order.items.map((it, i) => (
            <tr key={i} className="border-b border-gray-300 align-top">
              <td className="py-1.5 pr-2">
                {it.title}
                {it.sku && <div className="font-mono text-xs text-gray-600">{it.sku}</div>}
              </td>
              <td className="py-1.5 text-center font-mono tnum">{it.quantity}</td>
              {showPrices && (
                <td className="py-1.5 text-right font-mono tnum">
                  {formatMoney(Number(it.unit_price), locale)}
                </td>
              )}
              {showPrices && (
                <td className="py-1.5 text-right font-mono tnum">
                  {formatMoney(Number(it.line_total), locale)}
                </td>
              )}
              {!showPrices && <td className="py-1.5 text-center text-lg">☐</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals + credit (priced docs only) */}
      {showPrices && (
        <div className="mt-3 ml-auto w-64 space-y-1 text-sm">
          <PrintRow label="সাবটোটাল" value={formatMoney(Number(order.subtotal), locale)} />
          {Number(order.discount_total) > 0 && (
            <PrintRow label="ছাড়" value={`− ${formatMoney(Number(order.discount_total), locale)}`} />
          )}
          <PrintRow label="ডেলিভারি" value={formatMoney(Number(order.shipping_total), locale)} />
          <div className="flex justify-between border-t-2 border-black pt-1 font-bold">
            <span>সর্বমোট</span>
            <span className="font-mono tnum">{formatMoney(grandTotal, locale)}</span>
          </div>
          {creditDue > 0 && (
            <>
              <PrintRow label="পরিশোধিত" value={formatMoney(paidNow, locale)} />
              <div className="flex justify-between border-t border-black pt-1 font-bold text-black">
                <span>বাকি (এই অর্ডার)</span>
                <span className="font-mono tnum">{formatMoney(creditDue, locale)}</span>
              </div>
            </>
          )}
          {order.current_due != null && Number(order.current_due) > 0 && (
            <PrintRow
              label="মোট বকেয়া (সব মিলিয়ে)"
              value={formatMoney(Number(order.current_due), locale)}
            />
          )}
        </div>
      )}

      {/* Signatures (trade convention) */}
      <div className="mt-10 flex items-end justify-between text-xs">
        <div className="w-40 border-t border-black pt-1 text-center">ক্রেতার স্বাক্ষর</div>
        <div className="w-40 border-t border-black pt-1 text-center">
          {profile.name ? `${profile.name}-এর পক্ষে` : "বিক্রেতার স্বাক্ষর"}
        </div>
      </div>
    </div>
  );
}

function PrintRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-mono tnum">{value}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
