// Storefront not-found page (Phase 1 polish — P1.3). Renders for invalid tenant
// slugs, unknown product slugs, etc. Keeps the storefront chrome (StoreHeader
// + StoreFooter would be ideal, but this is a top-level not-found so it doesn't
// know the tenant — fall back to a global Hybrid-branded shell).
//
// Renders inside the storefront layout because Next.js routes /_sites/[tenant]/*
// notFound() calls through the segment's layout; a truly unknown tenant bubbles
// up here. For the bubble-up case we still want a Bengali-first message because
// most of our traffic is from Bangladesh.
import Link from "next/link";

export default function StorefrontNotFound() {
  return (
    <div className="mx-auto flex max-w-storefront flex-col items-center gap-4 px-4 py-section text-center">
      <p className="bn-heading text-3xl font-bold text-ink">404</p>
      <h1 className="bn-heading text-xl font-semibold text-ink">
        পেজ পাওয়া যায়নি
      </h1>
      <p className="bn-body max-w-md text-sm text-ink-muted">
        আপনি যে পেজটি খুঁজছেন সেটি হয়তো সরিয়ে ফেলা হয়েছে অথবা লিংকটি সঠিক নয়।
      </p>
      <Link
        href="/"
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-white transition hover:bg-primary-hover"
      >
        হোমপেজে ফিরে যান
      </Link>
    </div>
  );
}