// Hybrid brand lockup: the 3D isometric purple "H" mark + the "Hybrid"
// wordmark in Poppins 600. Two variants:
//   - "lockup" (default): mark + wordmark — header.
//   - "full": mark + wordmark + the "POWERING YOUR ONLINE BUSINESS" tagline
//     eyebrow — footer.
// On dark surfaces (the closing-CTA band), pass tone="onDark" to swap to the
// white mark + white wordmark.
//
// The mark image carries the purple; the wordmark stays brand-ink with a
// subtle accent on the trailing glyph for a polished, restrained feel.

const MARK = {
  default: "/marketing/logo-mark.webp",
  onDark: "/marketing/logo-mark-white.webp",
} as const;

interface HybridLogoProps {
  variant?: "lockup" | "full";
  tone?: "default" | "onDark";
  /** Localized tagline string (only rendered by the "full" variant). */
  tagline?: string;
  className?: string;
}

export function HybridLogo({
  variant = "lockup",
  tone = "default",
  tagline,
  className = "",
}: HybridLogoProps) {
  const isDark = tone === "onDark";
  const wordmarkColor = isDark ? "text-white" : "text-ink";
  const taglineColor = isDark ? "text-white/70" : "text-primary";

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className="inline-flex items-center gap-2">
        <img
          src={MARK[tone]}
          alt="Hybrid"
          width={36}
          height={36}
          decoding="async"
          className="h-8 w-8 shrink-0 sm:h-9 sm:w-9"
        />
        <span
          className={`brand-wordmark text-xl leading-none sm:text-[1.375rem] ${wordmarkColor}`}
          aria-hidden="true"
        >
          Hybrid
        </span>
      </span>
      {variant === "full" && tagline ? (
        <span className={`brand-tagline mt-2 text-[0.625rem] uppercase ${taglineColor}`}>
          {tagline}
        </span>
      ) : null}
    </span>
  );
}
