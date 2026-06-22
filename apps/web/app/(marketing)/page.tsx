import { Button } from "@hybrid/ui";

// Marketing root (apex / www). Intentionally a clean stub — the full conversion
// site is a later phase (blueprint §11). On-system (Bazaar Modern), Bengali,
// spacious; no AI-slop 3-col feature grid (DESIGN §9).
export default function MarketingHome() {
  return (
    <main className="min-h-screen bg-bg">
      <section className="mx-auto max-w-marketing px-4 py-section">
        <span className="text-base font-bold text-ink">Hybrid</span>
        <h1 className="bn-heading mt-section max-w-2xl text-4xl font-bold text-ink">
          মিনিটেই খুলুন আপনার অনলাইন দোকান
        </h1>
        <p className="bn-body mt-4 max-w-xl text-lg text-ink-muted">
          ফেসবুক পেজ থেকে সত্যিকারের শপে — ক্যাশ অন ডেলিভারি, কুরিয়ার আর বাংলা
          স্টোরফ্রন্ট, সব এক জায়গায়।
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="primary" size="lg">
            শুরু করুন
          </Button>
          <Button variant="secondary" size="lg">
            ডেমো দেখুন
          </Button>
        </div>
      </section>
    </main>
  );
}
