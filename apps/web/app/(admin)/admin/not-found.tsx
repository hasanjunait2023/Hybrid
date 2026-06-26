import Link from "next/link";
import { getDict } from "@/lib/i18n/server";

// Admin 404 — shown when a deep admin route doesn't resolve (e.g. unknown
// order id, deleted customer). Bengali-first copy, clear next-action buttons.
export default async function AdminNotFound() {
  const { locale, d: _ } = await getDict();
  const isBn = locale === "bn";

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-2xl font-bold text-ink-subtle">
        404
      </div>

      <h1 className="text-xl font-bold text-ink">
        {isBn ? "পেজ পাওয়া যায়নি" : "Page not found"}
      </h1>

      <p className="mt-2 text-sm text-ink-muted">
        {isBn
          ? "এই পেজটি আর নেই, বা আপনার অ্যাক্সেস নেই। ড্যাশবোর্ডে ফিরে যান।"
          : "This page doesn't exist, or you no longer have access. Head back to the dashboard."}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/admin"
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover active:translate-y-px"
        >
          {isBn ? "ড্যাশবোর্ডে ফিরে যান" : "Back to dashboard"}
        </Link>
        <Link
          href="/admin/orders"
          className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-2"
        >
          {isBn ? "অর্ডার দেখুন" : "View orders"}
        </Link>
      </div>

      <p className="mt-6 text-xs text-ink-subtle">
        {isBn
          ? "সমস্যা হচ্ছে? সাপোর্টে যোগাযোগ করুন।"
          : "Still stuck? Reach out to support."}
      </p>
    </div>
  );
}