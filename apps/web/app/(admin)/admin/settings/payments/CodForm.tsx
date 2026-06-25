"use client";

// COD enable toggle (DESIGN §P6). Market default ON. No credentials.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { toggleCod } from "./actions";

export function CodForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const t = useDict().admin.settingsPayments;
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = on !== enabled;

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", on ? "true" : "false");
    startTransition(async () => {
      const result = await toggleCod(null, fd);
      if (!result.ok) setError(result.error ?? t.saveFailed);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-ink">{t.cod.title}</h2>
          <p className="text-xs text-ink-muted">{t.cod.subtitle}</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
            className="h-5 w-5 accent-[var(--color-cod)]"
          />
          <span className="text-sm font-medium text-ink">{on ? t.cod.on : t.cod.off}</span>
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-md bg-success-weak px-3 py-2 text-sm font-medium text-success">
          {t.saved}
        </p>
      )}

      <Button onClick={save} disabled={pending || !dirty}>
        {pending ? t.saving : t.save}
      </Button>
    </section>
  );
}
