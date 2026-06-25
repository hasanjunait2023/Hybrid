import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { PageHeader } from "../../_ui";
import { ImportForm } from "./ImportForm";

// Product CSV import (P2-5). Bulk onboarding for sellers who keep their catalog
// in Excel. Columns: title (required), price, inventory, status, sku.
export const dynamic = "force-dynamic";

export default async function ProductImportPage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  return (
    <div lang="en" className="space-y-4">
      <PageHeader title="পণ্য ইম্পোর্ট (CSV)" subtitle="Excel থেকে একসাথে পণ্য যোগ করুন" />
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-ink-muted">
        <p className="font-semibold text-ink">কলাম:</p>
        <p className="mt-1 font-mono text-xs">title, price, inventory, status, sku</p>
        <p className="mt-2">
          <span className="font-semibold">title</span> আবশ্যক। status: draft / active / archived (ডিফল্ট draft)।
          প্রতিটি পণ্যে একটি ডিফল্ট ভ্যারিয়েন্ট তৈরি হবে।
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
