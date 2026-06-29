import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { PageHeader } from "../../_ui";
import { NewLandingPageForm } from "./NewLandingPageForm";

// Create new landing page — enter title + slug, then redirect to the block editor.
export default async function NewLandingPagePage() {
  const session = await getSession();
  if (!session) redirect("/dev-login?as=owner-a");
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) redirect("/platform");

  return (
    <div className="space-y-4">
      <PageHeader title="নতুন ল্যান্ডিং পেজ" />
      <NewLandingPageForm />
    </div>
  );
}
