"use client";

// Shipping & delivery settings form. Toggle + origin location + free-shipping
// threshold + default rate + the three zone rows (base + per-kg). Saves via the
// server action; the storefront calculator reads the same rows at checkout.
import { useState, useTransition } from "react";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import type { ShippingSettings } from "@/lib/admin/shipping";
import type { ShippingZone } from "@/lib/commerce/shipping";
import { saveShippingSettingsAction } from "./actions";

const ZONES: ShippingZone[] = ["same_district", "same_division", "other_division"];

const ZONE_LABEL: Record<ShippingZone, "sameDistrict" | "sameDivision" | "otherDivision"> = {
  same_district: "sameDistrict",
  same_division: "sameDivision",
  other_division: "otherDivision",
};

interface RateRow {
  base: string;
  perKg: string;
}

export function ShippingForm({ initial }: { initial: ShippingSettings }) {
  const t = useDict().admin.shipping;
  const [pending, startTransition] = useTransition();

  const [enabled, setEnabled] = useState(initial.enabled);
  const [originDivision, setOriginDivision] = useState(initial.originDivision ?? "");
  const [originDistrict, setOriginDistrict] = useState(initial.originDistrict ?? "");
  const [freeAbove, setFreeAbove] = useState(
    initial.freeAbove != null ? String(initial.freeAbove) : "",
  );
  const [defaultRate, setDefaultRate] = useState(String(initial.defaultRate));
  const [rates, setRates] = useState<Record<ShippingZone, RateRow>>(() => {
    const byZone = new Map(initial.rates.map((r) => [r.zone, r]));
    const seed = {} as Record<ShippingZone, RateRow>;
    for (const zone of ZONES) {
      const r = byZone.get(zone);
      seed[zone] = { base: String(r?.base ?? 0), perKg: String(r?.perKg ?? 0) };
    }
    return seed;
  });

  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setRate = (zone: ShippingZone, field: keyof RateRow, value: string) => {
    setRates((prev) => ({ ...prev, [zone]: { ...prev[zone], [field]: value } }));
  };

  const save = () => {
    setNote(null);
    setError(null);
    const trimmedFree = freeAbove.trim();
    startTransition(async () => {
      const res = await saveShippingSettingsAction({
        enabled,
        originDivision: originDivision.trim() || null,
        originDistrict: originDistrict.trim() || null,
        freeAbove: trimmedFree === "" ? null : Math.max(0, Number(trimmedFree) || 0),
        defaultRate: Math.max(0, Number(defaultRate) || 0),
        rates: ZONES.map((zone) => ({
          zone,
          base: Math.max(0, Number(rates[zone].base) || 0),
          perKg: Math.max(0, Number(rates[zone].perKg) || 0),
        })),
      });
      if (!res.ok) setError(res.error ?? t.saveFailed);
      else setNote(t.saved);
    });
  };

  const inputClass =
    "h-11 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-ink tnum focus:border-primary focus:outline-none";
  const labelClass = "text-2xs font-semibold uppercase tracking-wide text-ink-muted";

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-xs">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5 rounded border-border-strong accent-primary"
        />
        <span className="text-sm font-semibold text-ink">{t.enabledLabel}</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t.origin.division}</span>
          <input
            type="text"
            value={originDivision}
            onChange={(e) => setOriginDivision(e.target.value)}
            placeholder={t.origin.placeholder}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t.origin.district}</span>
          <input
            type="text"
            value={originDistrict}
            onChange={(e) => setOriginDistrict(e.target.value)}
            placeholder={t.origin.placeholder}
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t.freeAbove}</span>
          <input
            type="number"
            min={0}
            value={freeAbove}
            onChange={(e) => setFreeAbove(e.target.value)}
            placeholder={t.freeAbovePlaceholder}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t.defaultRate}</span>
          <input
            type="number"
            min={0}
            value={defaultRate}
            onChange={(e) => setDefaultRate(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="space-y-3">
        {ZONES.map((zone) => (
          <div key={zone} className="rounded-md border border-border bg-surface-2 p-3">
            <p className="mb-2 text-sm font-semibold text-ink">{t.zones[ZONE_LABEL[zone]]}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>{t.base}</span>
                <input
                  type="number"
                  min={0}
                  value={rates[zone].base}
                  onChange={(e) => setRate(zone, "base", e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>{t.perKg}</span>
                <input
                  type="number"
                  min={0}
                  value={rates[zone].perKg}
                  onChange={(e) => setRate(zone, "perKg", e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-muted">{t.hint}</p>

      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      {note && <p className="text-xs font-medium text-success">{note}</p>}

      <Button onClick={save} disabled={pending}>
        {pending ? "…" : t.save}
      </Button>
    </div>
  );
}
