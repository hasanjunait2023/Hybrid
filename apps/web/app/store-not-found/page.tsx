import { Button, HybridLogo } from "@hybrid/ui";
import { getDict } from "@/lib/i18n/server";

// Branded unknown-host fallback (blueprint §6 → middleware rewrite). Stays on
// the Bazaar Modern system so even the error reads as "real software".
export default async function StoreNotFound() {
  const { d } = await getDict();
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="max-w-md text-center">
        <span className="inline-flex justify-center"><HybridLogo /></span>
        <h1 className="bn-heading mt-6 text-3xl font-bold text-ink">
          {d.auth.storeNotFound.heading}
        </h1>
        <p className="bn-body mt-3 text-base text-ink-muted">
          {d.auth.storeNotFound.body}
        </p>
        <div className="mt-6 flex justify-center">
          <a href={`https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? ""}`}>
            <Button variant="primary">{d.auth.storeNotFound.cta}</Button>
          </a>
        </div>
      </div>
    </main>
  );
}
