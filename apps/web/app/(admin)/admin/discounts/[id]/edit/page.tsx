import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getDiscount } from "@/lib/admin/discounts";
import { DiscountForm } from "../../DiscountForm";

interface EditDiscountPageProps {
  params: Promise<{ id: string }>;
}

// ISO timestamp → the local "yyyy-MM-ddTHH:mm" value a datetime-local input
// expects. Empty string when null. Trims the seconds/zone tail.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function numToStr(n: number | null): string {
  return n == null ? "" : String(n);
}

export default async function EditDiscountPage({ params }: EditDiscountPageProps) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  const d = await getDiscount(tenantId, session.userId, id);
  if (!d) notFound();

  return (
    <div lang="en" className="space-y-4">
      <div className="flex items-center gap-3">
        <a href="/admin/discounts" className="text-sm font-medium text-ink-muted hover:text-primary">
          ← ডিসকাউন্ট
        </a>
        <h1 className="truncate font-mono text-xl font-bold uppercase text-ink">{d.code}</h1>
      </div>
      <DiscountForm
        initial={{
          id: d.id,
          code: d.code,
          title: d.title ?? "",
          type: d.type,
          value: d.type === "free_shipping" ? "" : String(d.value),
          minSubtotal: d.minSubtotal ? String(d.minSubtotal) : "",
          usageLimit: numToStr(d.usageLimit),
          perCustomerLimit: numToStr(d.perCustomerLimit),
          startsAt: toLocalInput(d.startsAt),
          endsAt: toLocalInput(d.endsAt),
          status: d.status,
        }}
      />
    </div>
  );
}
