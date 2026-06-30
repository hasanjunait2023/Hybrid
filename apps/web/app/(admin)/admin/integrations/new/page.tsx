import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { ConnectWizard } from "./ConnectWizard";

export const dynamic = "force-dynamic";

export default async function NewIntegrationPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect("/dev-login");

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">নতুন ইন্টিগ্রেশন সংযুক্ত করুন</h1>
        <p className="mt-1 text-sm text-ink-muted">
          আপনার বাইরের স্টোর বা ওয়েবসাইটকে Hybrid-এর সাথে সংযুক্ত করুন।
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <ConnectWizard />
      </div>
    </div>
  );
}
