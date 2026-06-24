// Circular testimonial avatar with graceful degradation. Missing files show a
// neutral surface circle (no broken image), keeping the testimonial layout intact.

interface AvatarProps {
  src: string;
  alt: string;
  /** Diameter in px. */
  size?: number;
}

export function Avatar({ src, alt, size = 48 }: AvatarProps) {
  return (
    <span
      className="inline-block flex-shrink-0 overflow-hidden rounded-full border border-border bg-surface-2"
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </span>
  );
}
