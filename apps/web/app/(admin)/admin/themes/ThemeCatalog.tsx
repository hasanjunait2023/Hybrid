"use client";

// Theme catalog island (DESIGN §Q2). Card grid (1/2/3 col), active theme ringed
// + badged, preview-before-activate, activate-with-confirm. On successful
// activation the seller is routed to the customizer on the new theme — the
// natural next step (DESIGN §Q2 activate flow).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, cn } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { activateThemeAction } from "./actions";

interface ThemeCard {
  code: string;
  name: string;
  descriptor: string;
  category: "general" | "fashion" | "electronics";
}

interface ThemeCatalogProps {
  themes: ThemeCard[];
  activeCode: string;
  /** e.g. "//store-a.lvh.me:3000" — preview opens {base}/?preview=1. */
  previewBase: string | null;
}

export function ThemeCatalog({ themes, activeCode, previewBase }: ThemeCatalogProps) {
  const router = useRouter();
  const t = useDict().admin.themes;
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleActivate(code: string) {
    setError(null);
    startTransition(async () => {
      const res = await activateThemeAction(code);
      if (!res.ok) {
        setError(res.error ?? t.catalog.activateFailed);
        setConfirming(null);
        return;
      }
      router.push("/admin/themes/customize");
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-danger bg-danger-weak px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {themes.map((theme) => {
          const isActive = theme.code === activeCode;
          return (
            <li
              key={theme.code}
              className={cn(
                "flex flex-col overflow-hidden rounded-lg border bg-surface shadow-xs transition md:hover:-translate-y-0.5 md:hover:shadow-sm",
                isActive ? "border-primary ring-2 ring-primary" : "border-border",
              )}
            >
              <ThemePreviewTile code={theme.code} isActive={isActive} />

              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-ink">{theme.name}</h3>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted">
                    {t.catalog.category[theme.category]}
                  </span>
                </div>
                <p className="bn-body flex-1 text-sm text-ink-muted">{theme.descriptor}</p>

                <div className="mt-2 flex items-center gap-2">
                  {previewBase && (
                    <a
                      href={`${previewBase}/?preview=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-ink hover:bg-surface-2"
                    >
                      {t.catalog.preview}
                    </a>
                  )}
                  {isActive ? (
                    <a
                      href="/admin/themes/customize"
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-white hover:opacity-90"
                    >
                      {t.catalog.customize}
                    </a>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => setConfirming(theme.code)}
                      disabled={pending}
                      className="min-h-11 flex-1"
                    >
                      {t.catalog.activate}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {confirming && (
        <ConfirmActivate
          themeName={themes.find((t) => t.code === confirming)?.name ?? ""}
          pending={pending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => handleActivate(confirming)}
        />
      )}
    </div>
  );
}

// Active-theme badge sits on a token-colored tile (no preview image asset ships
// this wave; the tile communicates the theme's primary palette instead).
function ThemePreviewTile({ code, isActive }: { code: string; isActive: boolean }) {
  const t = useDict().admin.themes;
  const palette: Record<string, string> = {
    doreja: "from-[#1D4ED8] to-[#F59E0B]",
    megh: "from-[#7C3AED] to-[#EC4899]",
    bazar: "from-[#047857] to-[#F59E0B]",
  };
  return (
    <div
      className={cn(
        "relative grid aspect-[1.4/1] place-items-center bg-gradient-to-br",
        palette[code] ?? "from-primary to-accent",
      )}
    >
      {isActive && (
        <span className="absolute left-2 top-2 rounded-full bg-success-weak px-2 py-0.5 text-2xs font-semibold text-success">
          ✓ {t.catalog.currentTheme}
        </span>
      )}
      <span className="text-lg font-bold text-white/90 drop-shadow">{code}</span>
    </div>
  );
}

function ConfirmActivate({
  themeName,
  pending,
  onCancel,
  onConfirm,
}: {
  themeName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useDict().admin.themes;
  return (
    <div
      className="fixed inset-0 z-modal flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activate-title"
    >
      <div className="w-full max-w-md rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        <h2 id="activate-title" className="text-lg font-bold text-ink">
          {t.catalog.confirm.title.replace("{theme}", themeName)}
        </h2>
        <p className="bn-body mt-2 text-sm text-ink-muted">{t.catalog.confirm.body}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="min-h-11 flex-1 rounded-md border border-border text-sm font-medium text-ink hover:bg-surface-2"
          >
            {t.catalog.confirm.cancel}
          </button>
          <Button type="button" onClick={onConfirm} disabled={pending} className="min-h-11 flex-1">
            {pending ? t.catalog.confirm.activating : t.catalog.confirm.activate}
          </Button>
        </div>
      </div>
    </div>
  );
}
