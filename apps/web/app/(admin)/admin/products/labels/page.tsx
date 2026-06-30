// Server wrapper for the barcode label picker. Auth-gates the route and
// renders the client picker. The picker does its own data fetch
// (GET /api/admin/products/labels-list) so it can refresh on toggle without
// a full page reload.

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/requireSession";
import { getActiveTenantId } from "@/lib/admin/data";
import { PickerClient } from "./PickerClient";

export const dynamic = "force-dynamic";

export default async function LabelsPage() {
  const session = await requireSession();
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");
  return <PickerClient />;
}
