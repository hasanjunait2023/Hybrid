import { notFound } from "next/navigation";
import { getTenantContextBySlug } from "@/lib/storefront/data";
import { CartIsland } from "./CartIsland";

interface CartPageProps {
  params: Promise<{ tenant: string }>;
}

// Cart (blueprint S-CHECKOUT). Server shell resolves/guards the tenant; the cart
// itself is the client island reading localStorage (no server cart).
export default async function CartPage({ params }: CartPageProps) {
  const { tenant: slug } = await params;
  const ctx = await getTenantContextBySlug(slug);
  if (!ctx) notFound();

  return <CartIsland tenantSlug={slug} />;
}
