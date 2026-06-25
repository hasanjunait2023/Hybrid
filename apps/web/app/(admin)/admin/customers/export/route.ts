// Customer CSV export (P2-5). Auth + tenant, then stream customers as CSV.
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { listCustomers } from "@/lib/admin/customers";
import { customersToCsv } from "@/lib/admin/csv";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) return new Response("No tenant", { status: 403 });

  const customers = await listCustomers(tenantId, session.userId, {});
  const csv = customersToCsv(
    customers.map((c) => ({
      name: c.name,
      phone: c.phone ?? "",
      ordersCount: c.ordersCount,
      totalSpent: c.totalSpent,
    })),
  );
  return new Response(String.fromCharCode(0xfeff) + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="customers.csv"',
    },
  });
}
