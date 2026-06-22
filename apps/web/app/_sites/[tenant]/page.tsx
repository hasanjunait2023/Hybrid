// Storefront home, reached via middleware rewrite /_sites/{slug}/...
// PLACEHOLDER (frontend: theme tokens + hero + featured, Slices 2-3).
export default async function StorefrontHome({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  return <main>Storefront: {tenant} — placeholder</main>;
}
