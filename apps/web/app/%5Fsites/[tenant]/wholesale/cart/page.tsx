import { notFound } from "next/navigation";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { WholesaleCartIsland } from "./CartIsland";

interface WholesaleCartPageProps {
  params: Promise<{ tenant: string }>;
}

export default async function WholesaleCartPage({
  params,
}: WholesaleCartPageProps) {
  const { tenant: slug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  return <WholesaleCartIsland tenantSlug={slug} />;
}
