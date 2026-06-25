"use client";

// Visual customizer island (DESIGN §Q1). Owns the working draft state, debounced
// autosave, publish, and the responsive panel/preview split:
//   mobile (base–lg): preview fills the screen, controls in a bottom sheet,
//                      sticky [কাস্টমাইজ করুন] + [প্রকাশ করুন] bar.
//   desktop (≥ lg):    fixed 360px left control rail + live preview, device-size
//                      toggle (📱360 / 💻1280) above the preview.
// The preview is the storefront's admin-gated ?preview=1 route in an iframe; we
// autosave the draft before refreshing it so the preview reflects edits.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@hybrid/ui";
import type { ThemeSettings } from "@/lib/theme/schema";
import { useDict } from "@/lib/i18n/provider";
import { saveDraftAction, publishThemeAction } from "../actions";
import { ColorControls } from "./controls/ColorControls";
import { TypographyControls } from "./controls/TypographyControls";
import { ContentControls } from "./controls/ContentControls";
import { SectionControls } from "./controls/SectionControls";

interface CollectionOption {
  id: string;
  title: string;
}

interface CustomizerProps {
  initialSettings: ThemeSettings;
  collections: CollectionOption[];
  previewUrl: string | null;
  hasPublished: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "error";
type Group = "colors" | "typography" | "content" | "sections";
type Device = "mobile" | "desktop";

export function Customizer({
  initialSettings,
  collections,
  previewUrl,
  hasPublished,
}: CustomizerProps) {
  const t = useDict().admin.themes;
  const [settings, setSettings] = useState<ThemeSettings>(initialSettings);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [dirty, setDirty] = useState(false);
  const [openGroup, setOpenGroup] = useState<Group | null>("colors");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [device, setDevice] = useState<Device>("mobile");
  const [publishing, startPublish] = useTransition();
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState(hasPublished);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced autosave: persist the draft, then refresh the preview iframe so it
  // shows the latest committed draft (the ?preview route reads the DB draft row).
  const scheduleSave = useCallback((next: ThemeSettings) => {
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const res = await saveDraftAction(JSON.stringify(next));
      if (res.ok) {
        setSaveState("saved");
        if (iframeRef.current) {
          // eslint-disable-next-line no-self-assign
          iframeRef.current.src = iframeRef.current.src;
        }
      } else {
        setSaveState("error");
      }
    }, 600);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function update(next: ThemeSettings) {
    setSettings(next);
    setDirty(true);
    scheduleSave(next);
  }

  function handlePublish() {
    setPublishError(null);
    startPublish(async () => {
      const res = await publishThemeAction();
      if (!res.ok) {
        setPublishError(res.error ?? t.customizer.publishFailed);
        return;
      }
      setPublished(true);
      setDirty(false);
      setPublishOpen(false);
      if (iframeRef.current) {
        // eslint-disable-next-line no-self-assign
        iframeRef.current.src = iframeRef.current.src;
      }
    });
  }

  const controls = (
    <Accordion
      openGroup={openGroup}
      onToggle={(g) => setOpenGroup((cur) => (cur === g ? null : g))}
    >
      {(group) => {
        switch (group) {
          case "colors":
            return (
              <ColorControls
                colors={settings.colors}
                onChange={(colors) => update({ ...settings, colors })}
              />
            );
          case "typography":
            return (
              <TypographyControls
                typography={settings.typography}
                onChange={(typography) => update({ ...settings, typography })}
              />
            );
          case "content":
            return (
              <ContentControls
                content={settings.content}
                collections={collections}
                onChange={(content) => update({ ...settings, content })}
              />
            );
          case "sections":
            return (
              <SectionControls
                sections={settings.sections}
                onChange={(sections) => update({ ...settings, sections })}
              />
            );
        }
      }}
    </Accordion>
  );

  return (
    <div className="lg:flex lg:h-[calc(100vh-7rem)] lg:gap-4">
      {/* Desktop left rail */}
      <aside className="hidden w-[360px] shrink-0 flex-col rounded-lg border border-border bg-surface lg:flex">
        <div className="border-b border-border px-4 py-3">
          <h1 className="text-base font-bold text-ink">{t.customizer.heading}</h1>
          <StatusChip dirty={dirty} saveState={saveState} published={published} />
        </div>
        <div className="flex-1 overflow-y-auto p-4">{controls}</div>
        <div className="border-t border-border p-4">
          <Button
            type="button"
            fullWidth
            onClick={() => setPublishOpen(true)}
            disabled={publishing}
          >
            {t.customizer.publish}
          </Button>
        </div>
      </aside>

      {/* Preview */}
      <div className="flex flex-1 flex-col">
        <div className="mb-2 hidden items-center justify-center gap-2 lg:flex">
          <DeviceToggle device={device} onChange={setDevice} />
        </div>
        <PreviewFrame ref={iframeRef} url={previewUrl} device={device} />
      </div>

      {/* Mobile sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-sticky flex gap-2 border-t border-border bg-surface p-3 lg:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="min-h-11 flex-1 rounded-md border border-border text-sm font-semibold text-ink hover:bg-surface-2"
        >
          {t.customizer.customizeButton}
        </button>
        <Button
          type="button"
          onClick={() => setPublishOpen(true)}
          disabled={publishing}
          className="min-h-11 flex-1"
        >
          {t.customizer.publish}
        </Button>
      </div>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-modal flex flex-col justify-end bg-black/30 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t.customizer.controlsLabel}
        >
          <button
            type="button"
            aria-label={t.customizer.closeSheet}
            className="flex-1"
            onClick={() => setSheetOpen(false)}
          />
          <div className="max-h-[70vh] overflow-y-auto rounded-t-2xl bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <StatusChip dirty={dirty} saveState={saveState} published={published} />
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-md px-3 py-1 text-sm font-medium text-ink-muted hover:bg-surface-2"
              >
                {t.customizer.sheetClose}
              </button>
            </div>
            {controls}
          </div>
        </div>
      )}

      {publishOpen && (
        <PublishConfirm
          publishing={publishing}
          error={publishError}
          onCancel={() => setPublishOpen(false)}
          onConfirm={handlePublish}
        />
      )}
    </div>
  );
}

function StatusChip({
  dirty,
  saveState,
  published,
}: {
  dirty: boolean;
  saveState: SaveState;
  published: boolean;
}) {
  const t = useDict().admin.themes;
  if (saveState === "saving") {
    return <span className="text-xs text-ink-muted">{t.customizer.status.saving}</span>;
  }
  if (saveState === "error") {
    return <span className="text-xs font-medium text-danger">{t.customizer.status.saveError}</span>;
  }
  if (dirty || !published) {
    return (
      <span className="inline-flex items-center rounded-full bg-st-pending-weak px-2 py-0.5 text-2xs font-semibold text-st-pending">
        {t.customizer.status.draft}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-success-weak px-2 py-0.5 text-2xs font-semibold text-success">
      {t.customizer.status.published}
    </span>
  );
}

function DeviceToggle({
  device,
  onChange,
}: {
  device: Device;
  onChange: (d: Device) => void;
}) {
  const t = useDict().admin.themes;
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      <button
        type="button"
        onClick={() => onChange("mobile")}
        aria-pressed={device === "mobile"}
        className={`min-h-9 rounded-md px-3 text-sm font-medium ${
          device === "mobile" ? "bg-primary-weak text-primary" : "text-ink-muted"
        }`}
      >
        {t.customizer.device.mobile}
      </button>
      <button
        type="button"
        onClick={() => onChange("desktop")}
        aria-pressed={device === "desktop"}
        className={`min-h-9 rounded-md px-3 text-sm font-medium ${
          device === "desktop" ? "bg-primary-weak text-primary" : "text-ink-muted"
        }`}
      >
        {t.customizer.device.desktop}
      </button>
    </div>
  );
}

// React 19: ref is a plain prop, no forwardRef needed (repo react rules).
function PreviewFrame({
  ref,
  url,
  device,
}: {
  ref?: React.Ref<HTMLIFrameElement>;
  url: string | null;
  device: Device;
}) {
  const t = useDict().admin.themes;
  if (!url) {
    return (
      <div className="grid flex-1 place-items-center rounded-lg border border-border bg-surface-2 text-sm text-ink-muted">
        {t.customizer.preview.unavailable}
      </div>
    );
  }
  const widthClass = device === "mobile" ? "w-[360px]" : "w-full max-w-[1280px]";
  return (
    <div className="flex flex-1 justify-center overflow-hidden rounded-lg border border-border bg-surface-2 p-2">
      <iframe
        ref={ref}
        src={url}
        title={t.customizer.preview.title}
        className={`h-full ${widthClass} rounded-md border border-border bg-white`}
      />
    </div>
  );
}

function PublishConfirm({
  publishing,
  error,
  onCancel,
  onConfirm,
}: {
  publishing: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useDict().admin.themes;
  return (
    <div
      className="fixed inset-0 z-modal flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-title"
    >
      <div className="w-full max-w-md rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        <h2 id="publish-title" className="text-lg font-bold text-ink">
          {t.customizer.publishConfirm.title}
        </h2>
        <p className="bn-body mt-2 text-sm text-ink-muted">{t.customizer.publishConfirm.body}</p>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={publishing}
            className="min-h-11 flex-1 rounded-md border border-border text-sm font-medium text-ink hover:bg-surface-2"
          >
            {t.customizer.publishConfirm.cancel}
          </button>
          <Button type="button" onClick={onConfirm} disabled={publishing} className="min-h-11 flex-1">
            {publishing ? t.customizer.publishConfirm.publishing : t.customizer.publishConfirm.publish}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Accordion of the four groups (DESIGN §Q1.2). Render-prop body so the same
// markup drives both the desktop rail and the mobile sheet.
function Accordion({
  openGroup,
  onToggle,
  children,
}: {
  openGroup: Group | null;
  onToggle: (g: Group) => void;
  children: (group: Group) => React.ReactNode;
}) {
  const t = useDict().admin.themes;
  const groups: Group[] = ["colors", "typography", "content", "sections"];
  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const open = openGroup === g;
        return (
          <div key={g} className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => onToggle(g)}
              aria-expanded={open}
              className="flex min-h-11 w-full items-center justify-between px-3 text-sm font-semibold text-ink"
            >
              {t.customizer.groups[g]}
              <span className="text-ink-muted">{open ? "−" : "+"}</span>
            </button>
            {open && <div className="border-t border-border p-3">{children(g)}</div>}
          </div>
        );
      })}
    </div>
  );
}
