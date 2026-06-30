"use client";

// R1 — product video carousel for the storefront PDP.
//
// Server fetches the videos; the carousel itself is a small client island so we
// can wire prev/next buttons + lazy-loaded <video> preloading. Each <video>
//   * uses the byte-stream URL as `src` (browsers fetch on demand, never
//     pre-buffer);
//   * has `poster` = the merchant-uploaded cover image so the page renders
//     thumbnails-only until the buyer taps play (critical on 3G BD where a
//     /cdn/...mp4 fetch without a poster would eat tens of MB on scroll);
//   * lazy-loads via IntersectionObserver (below-the-fold clips never touch
//     the network); the first (above-the-fold) video preloads metadata only;
//   * is muted by default + playsInline so iOS Safari doesn't force full-screen;
//   * Bengali labels for all controls (DESIGN §Bengali-first).

import { useEffect, useMemo, useRef, useState } from "react";

export interface StorefrontVideo {
  /** Opaque blob URL (R2 / MinIO / local), played directly. */
  url: string;
  /** Cover image — required for above-the-fold lazy render. */
  posterUrl: string | null;
  /** Merchant-supplied title (optional). */
  title: string | null;
  /** Duration in seconds (optional, used for the badge). */
  durationSeconds: number | null;
}

export interface ProductVideoGalleryLabels {
  videoSectionTitle: string;
  videoPlay: string;
  videoPause: string;
  videoUnavailable: string;
  videoMute: string;
  videoUnmute: string;
  /** "Previous" / "পূর্ববর্তী" — kept generic so we don't churn on copy edits. */
  prev: string;
  next: string;
}

interface ProductVideoGalleryProps {
  videos: StorefrontVideo[];
  labels: ProductVideoGalleryLabels;
}

// Cache the IntersectionObserver across renders (browser API guard).
function useLazyMount<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // SSG / old browser fallback: mount immediately. The browser will still
      // only buffer bytes when the user taps play.
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return { ref, visible };
}

export function ProductVideoGallery({ videos, labels }: ProductVideoGalleryProps) {
  const [index, setIndex] = useState(0);
  if (!videos.length) return null;

  const current = videos[Math.min(index, videos.length - 1)]!;
  const prevIndex = (index - 1 + videos.length) % videos.length;
  const nextIndex = (index + 1) % videos.length;

  // Lazy-mount the next clip only when the user is about to play it.
  const player = useLazyMount<HTMLDivElement>();
  const showControls = videos.length > 1;

  const playerKey = useMemo(() => `${current.url}#${index}`, [current.url, index]);

  return (
    <section className="mt-6 space-y-2 border-t border-border pt-2">
      <h2 className="bn-heading text-base font-bold text-ink">
        {labels.videoSectionTitle}
      </h2>

      <div className="relative overflow-hidden rounded-lg border border-border bg-black">
        <div
          ref={player.ref}
          // Above-the-fold (first clip) shows the player once visible;
          // everything below the fold mounts only when scrolled into view.
          data-mounted={player.visible ? "1" : "0"}
          key={playerKey}
        >
          {player.visible ? (
            <VideoPlayer video={current} labels={labels} priority={index === 0} />
          ) : (
            // Skeleton placeholder keeps the layout stable while below-fold
            // clips defer network. 16:9 keeps the page from jumping.
            <div className="aspect-video w-full bg-surface-2" aria-hidden />
          )}
        </div>

        {showControls && (
          <>
            <button
              type="button"
              aria-label={labels.prev}
              onClick={() => setIndex(prevIndex)}
              className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-base text-white hover:bg-black/70"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label={labels.next}
              onClick={() => setIndex(nextIndex)}
              className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-base text-white hover:bg-black/70"
            >
              ›
            </button>
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-semibold text-white">
              {index + 1}/{videos.length}
            </span>
          </>
        )}
      </div>

      {videos.length > 1 && (
        <ol className="flex gap-2 overflow-x-auto">
          {videos.map((v, i) => (
            <li key={v.url}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={v.title ?? `${labels.videoSectionTitle} ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={`relative h-12 w-16 flex-none overflow-hidden rounded-sm border ${
                  i === index ? "border-primary" : "border-border"
                }`}
              >
                {v.posterUrl ? (
                  <img
                    src={v.posterUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-surface-2 text-2xs text-ink-muted">
                    {i + 1}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// Plain HTML5 <video>. Browsers will NOT autoplay (no autoplay attr) — the
// buyer must tap play, which is exactly what we want on 3G.
function VideoPlayer({
  video,
  labels,
  priority,
}: {
  video: StorefrontVideo;
  labels: ProductVideoGalleryLabels;
  priority: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // When the gallery advances to a new clip, reset the player.
    const el = ref.current;
    if (!el) return;
    el.load();
  }, [video.url]);

  return (
    <div className="relative aspect-video w-full">
      {failed ? (
        <div className="grid h-full w-full place-items-center bg-black text-sm text-white">
          {labels.videoUnavailable}
        </div>
      ) : (
        <video
          ref={ref}
          src={video.url}
          poster={video.posterUrl ?? undefined}
          // Default state: no preload (saves bandwidth). The above-the-fold
          // first clip gets preload="metadata" so a tap on play starts faster.
          preload={priority ? "metadata" : "none"}
          // Muting on; phones won't auto-play without it, and we WANT a tap.
          muted={muted}
          playsInline
          controls
          controlsList="nodownload"
          aria-label={video.title ?? labels.videoSectionTitle}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full bg-black"
        />
      )}
      <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1.5">
        {video.title && (
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-2xs font-semibold text-white">
            {video.title}
          </span>
        )}
        {video.durationSeconds != null && (
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-2xs font-semibold text-white">
            {formatDuration(video.durationSeconds)}
          </span>
        )}
      </div>
      <button
        type="button"
        aria-label={muted ? labels.videoUnmute : labels.videoMute}
        onClick={() => setMuted((m) => !m)}
        className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-2xs font-semibold text-white"
      >
        {muted ? labels.videoUnmute : labels.videoMute}
      </button>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
