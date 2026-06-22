import { Button } from "@hybrid/ui";

// Branded unknown-host fallback (blueprint §6 → middleware rewrite). Stays on
// the Bazaar Modern system so even the error reads as "real software".
export default function StoreNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="max-w-md text-center">
        <span className="text-base font-bold text-ink">Hybrid</span>
        <h1 className="bn-heading mt-6 text-3xl font-bold text-ink">
          স্টোরটি খুঁজে পাওয়া যায়নি
        </h1>
        <p className="bn-body mt-3 text-base text-ink-muted">
          এই ঠিকানায় কোনো সচল স্টোর নেই। লিংকটি আবার দেখে নিন, অথবা নিজের স্টোর
          খুলুন।
        </p>
        <div className="mt-6 flex justify-center">
          <a href={`https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? ""}`}>
            <Button variant="primary">Hybrid-এ স্টোর খুলুন</Button>
          </a>
        </div>
      </div>
    </main>
  );
}
