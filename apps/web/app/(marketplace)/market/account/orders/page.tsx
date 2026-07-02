import Link from "next/link";
import { formatBdtBangla } from "@hybrid/ui";
import { getBuyerSession } from "@/lib/marketplace/session";
import { getBuyerOrders } from "@/lib/marketplace/data";

const STATUS_BN: Record<string, string> = {
  pending: "অপেক্ষমাণ",
  confirmed: "নিশ্চিত",
  partial: "আংশিক",
  failed: "ব্যর্থ",
  processing: "প্রক্রিয়াধীন",
  shipped: "শিপড",
  delivered: "ডেলিভারড",
  cancelled: "বাতিল",
};

export default async function AccountOrdersPage() {
  const session = await getBuyerSession();
  if (!session) {
    return (
      <div className="py-12 text-center">
        <p className="text-ink-muted">অর্ডার দেখতে লগইন করুন।</p>
        <Link href="/login?next=/account/orders" className="mt-3 inline-block text-primary">
          লগইন
        </Link>
      </div>
    );
  }

  const orders = await getBuyerOrders(session.buyerId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">আমার অর্ডার</h1>
      {orders.length === 0 ? (
        <p className="text-ink-muted">কোনো অর্ডার নেই।</p>
      ) : (
        orders.map((o) => (
          <section key={o.id} className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-medium">{STATUS_BN[o.status] ?? o.status}</span>
              <span className="text-sm font-semibold">{formatBdtBangla(o.grandTotal)}</span>
            </div>
            <ul className="divide-y divide-border">
              {o.suborders.map((s, i) => (
                <li key={i} className="flex flex-col gap-1 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {s.vendorName}
                      {s.orderNumber ? ` · #${s.orderNumber}` : ""}
                    </span>
                    <span className="text-ink-muted">
                      {STATUS_BN[s.status] ?? s.status} · {formatBdtBangla(s.grandTotal)}
                    </span>
                  </div>
                  {s.trackingCode ? (
                    <p className="text-xs text-ink-muted">
                      ট্র্যাকিং: <span className="font-mono text-ink">{s.trackingCode}</span>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
