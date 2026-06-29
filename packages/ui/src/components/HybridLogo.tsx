// Shared Hybrid brand lockup — the isometric "H" mark + "Hybrid" wordmark.
// Used on every Hybrid-branded surface (admin, platform, auth, error pages) so
// branding is consistent. The mark lives at a TOP-LEVEL public path
// (/hybrid-mark.webp) on purpose: nested public assets (/marketing/*) are
// rewritten by the host->path middleware on the admin/app subdomains and 404
// there, so the brand must be served from the root to render everywhere.
//
// tone="onDark" swaps to the white mark for dark surfaces. Wordmark uses the
// app's default bold face (no marketing-only font dependency).

const MARK = {
  default: "/hybrid-mark.webp",
  onDark: "/hybrid-mark-white.webp",
} as const;

interface HybridLogoProps {
  tone?: "default" | "onDark";
  size?: "sm" | "md" | "lg";
  /** Hide the "Hybrid" wordmark, showing only the mark (tight spaces). */
  markOnly?: boolean;
  className?: string;
}

export function HybridLogo({
  tone = "default",
  size = "md",
  markOnly = false,
  className = "",
}: HybridLogoProps) {
  const dim = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const word = size === "lg" ? "text-2xl" : size === "sm" ? "text-[15px]" : "text-lg";
  const color = tone === "onDark" ? "text-white" : "text-ink";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={MARK[tone]}
        alt="Hybrid"
        width={40}
        height={40}
        decoding="async"
        className={`${dim} shrink-0`}
      />
      {!markOnly && (
        <span className={`font-bold leading-none tracking-tight ${word} ${color}`}>Hybrid</span>
      )}
    </span>
  );
}
