// Marketing image with graceful degradation. The real asset files land in
// apps/web/public/marketing/ later; until then (or on a load error) the neutral
// surface background + aspect-ratio box keeps the layout intact with no broken
// icon and no layout shift. Plain <img> with explicit dimensions avoids
// next/image config churn for local public assets.

interface MarketingImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  rounded?: "lg" | "xl";
}

export function MarketingImage({
  src,
  alt,
  width,
  height,
  className = "",
  priority = false,
  rounded = "xl",
}: MarketingImageProps) {
  const radius = rounded === "lg" ? "rounded-lg" : "rounded-xl";
  return (
    <div
      className={`relative overflow-hidden border border-border bg-surface-2 ${radius} ${className}`}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
