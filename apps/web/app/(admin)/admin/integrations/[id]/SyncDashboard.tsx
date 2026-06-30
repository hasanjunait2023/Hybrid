"use client";

import { useState, useTransition } from "react";
import { syncNowAction, updateConfigAction, pauseIntegrationAction, resumeIntegrationAction, deleteIntegrationAction } from "./actions";
import type { Integration, SyncConfig, SyncLogRow } from "@/lib/integrations/types";

interface Props {
  integration: Integration;
  logs: SyncLogRow[];
  webhookUrl: string;
}

const ENTITY_LABELS = {
  product: { bn: "পণ্য", icon: "📦" },
  inventory: { bn: "স্টক", icon: "🗂️" },
  order: { bn: "অর্ডার", icon: "🛍️" },
  customer: { bn: "কাস্টমার", icon: "👤" },
} as const;

const DIRECTION_LABELS = {
  import: "ইমপোর্ট (বাইরে → Hybrid)",
  export: "এক্সপোর্ট (Hybrid → বাইরে)",
  bidirectional: "উভয়দিক",
};

const STATUS_COLORS = {
  active: "bg-success/10 text-success",
  pending: "bg-yellow-100 text-yellow-700",
  paused: "bg-surface-2 text-ink-muted",
  error: "bg-error/10 text-error",
};

type EntityKey = "product" | "inventory" | "order";

export function SyncDashboard({ integration, logs, webhookUrl }: Props) {
  const [config, setConfig] = useState<SyncConfig>(integration.config);
  const [syncing, setSyncing] = useState<EntityKey | null>(null);
  const [syncResult, setSyncResult] = useState<{ entity: EntityKey; ok: boolean; synced?: number; failed?: number; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showDelete, setShowDelete] = useState(false);

  const entityKeys: EntityKey[] = ["product", "inventory", "order"];

  async function handleSync(entity: EntityKey) {
    setSyncing(entity);
    setSyncResult(null);
    const result = await syncNowAction(integration.id, entity);
    setSyncing(null);
    setSyncResult({ entity, ...result });
  }

  function handleEntityToggle(key: EntityKey, field: "enabled", val: boolean) {
    const prev = config.entities[key] ?? { enabled: false, direction: "import" as const };
    const next: SyncConfig = {
      ...config,
      entities: { ...config.entities, [key]: { ...prev, [field]: val } },
    };
    setConfig(next);
    startTransition(() => { void updateConfigAction(integration.id, next); });
  }

  function handleDirectionChange(key: EntityKey, dir: "import" | "export" | "bidirectional") {
    const prev = config.entities[key] ?? { enabled: false, direction: "import" as const };
    const next: SyncConfig = {
      ...config,
      entities: { ...config.entities, [key]: { ...prev, direction: dir } },
    };
    setConfig(next);
    startTransition(() => { void updateConfigAction(integration.id, next); });
  }

  function handleAutoSync(val: boolean) {
    const next: SyncConfig = { ...config, auto_sync: val };
    setConfig(next);
    startTransition(() => { void updateConfigAction(integration.id, next); });
  }

  function handleInterval(val: number) {
    const next: SyncConfig = { ...config, sync_interval_minutes: val };
    setConfig(next);
    startTransition(() => { void updateConfigAction(integration.id, next); });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[integration.status]}`}>
              {integration.status === "active" ? "সক্রিয়" : integration.status === "paused" ? "বিরতি" : integration.status === "error" ? "ত্রুটি" : "মুলতবি"}
            </span>
            <span className="text-sm font-semibold text-ink">{integration.displayName}</span>
            <span className="text-xs text-ink-muted capitalize">{integration.platform}</span>
          </div>
          {integration.lastSyncedAt && (
            <p className="mt-1 text-xs text-ink-muted">
              শেষ সিঙ্ক: {new Date(integration.lastSyncedAt).toLocaleString("bn-BD")}
            </p>
          )}
          {integration.syncError && (
            <p className="mt-1 text-xs text-error">{integration.syncError}</p>
          )}
        </div>
        <div className="flex gap-2">
          {integration.status === "active" ? (
            <button
              type="button"
              onClick={() => startTransition(() => { void pauseIntegrationAction(integration.id); })}
              disabled={isPending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-60"
            >
              ⏸ বিরতি
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startTransition(() => { void resumeIntegrationAction(integration.id); })}
              disabled={isPending}
              className="rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
            >
              ▶ পুনরায় চালু
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="rounded-lg border border-error/40 px-3 py-1.5 text-xs font-medium text-error hover:bg-error/5"
          >
            মুছুন
          </button>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-1 text-xs font-semibold text-ink-muted">ওয়েবহুক URL</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs text-ink">
            {webhookUrl}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(webhookUrl)}
            className="rounded px-2 py-1 text-xs text-ink-muted hover:text-ink"
          >
            কপি
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          আপনার বাইরের সাইটে এই URL টি ওয়েবহুক হিসেবে সেট করুন।
        </p>
      </div>

      {/* Entity sync config */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <p className="mb-3 font-semibold text-ink">সিঙ্ক কনফিগারেশন</p>
        <div className="flex flex-col gap-3">
          {entityKeys.map((key) => {
            const ec = config.entities[key] ?? { enabled: false, direction: "import" as const };
            const meta = ENTITY_LABELS[key];
            return (
              <div key={key} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span>{meta.icon}</span>
                    <span className="text-sm font-medium text-ink">{meta.bn}</span>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={ec.enabled}
                      onChange={(e) => handleEntityToggle(key, "enabled", e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    সক্রিয়
                  </label>
                </div>
                {ec.enabled && (
                  <div className="flex items-center gap-2">
                    <select
                      value={ec.direction}
                      onChange={(e) => handleDirectionChange(key, e.target.value as "import" | "export" | "bidirectional")}
                      className="rounded border border-border bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      {Object.entries(DIRECTION_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleSync(key)}
                      disabled={syncing === key || integration.status !== "active"}
                      className="ml-auto rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                    >
                      {syncing === key ? "সিঙ্ক হচ্ছে…" : "এখনই সিঙ্ক"}
                    </button>
                  </div>
                )}
                {syncResult?.entity === key && (
                  <p className={`text-xs ${syncResult.ok ? "text-success" : "text-error"}`}>
                    {syncResult.ok
                      ? `✓ ${syncResult.synced} টি সিঙ্ক হয়েছে${syncResult.failed ? `, ${syncResult.failed} ব্যর্থ` : ""}`
                      : `✕ ${syncResult.error}`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Auto-sync settings */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 font-semibold text-ink">স্বয়ংক্রিয় সিঙ্ক</p>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={config.auto_sync}
              onChange={(e) => handleAutoSync(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            স্বয়ংক্রিয় সিঙ্ক চালু রাখুন
          </label>
          {config.auto_sync && (
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              প্রতি
              <input
                type="number"
                value={config.sync_interval_minutes}
                min={15}
                max={1440}
                onChange={(e) => handleInterval(Number(e.target.value))}
                className="w-20 rounded border border-border px-2 py-1 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              মিনিট পরপর
            </label>
          )}
        </div>
      </div>

      {/* Sync log */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 font-semibold text-ink">সিঙ্ক লগ</p>
        {logs.length === 0 ? (
          <p className="text-sm text-ink-muted">এখনো কোনো সিঙ্ক হয়নি।</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="pb-2 pr-3">ধরন</th>
                  <th className="pb-2 pr-3">দিক</th>
                  <th className="pb-2 pr-3">ট্রিগার</th>
                  <th className="pb-2 pr-3">স্ট্যাটাস</th>
                  <th className="pb-2 pr-3">সফল</th>
                  <th className="pb-2">সময়</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id} className="text-ink">
                    <td className="py-1.5 pr-3">{ENTITY_LABELS[log.entityType as keyof typeof ENTITY_LABELS]?.bn ?? log.entityType}</td>
                    <td className="py-1.5 pr-3">{log.direction === "import" ? "↓" : log.direction === "export" ? "↑" : "↕"}</td>
                    <td className="py-1.5 pr-3">{log.trigger}</td>
                    <td className={`py-1.5 pr-3 font-medium ${log.status === "success" ? "text-success" : log.status === "error" ? "text-error" : "text-ink-muted"}`}>
                      {log.status}
                    </td>
                    <td className="py-1.5 pr-3">{log.itemsSynced}/{log.itemsSynced + log.itemsFailed}</td>
                    <td className="py-1.5 text-ink-muted">
                      {new Date(log.startedAt).toLocaleString("bn-BD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-sm rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl">
            <p className="font-semibold text-ink">ইন্টিগ্রেশন মুছবেন?</p>
            <p className="mt-1 text-sm text-ink-muted">
              এটি করলে সংযোগ এবং সমস্ত সিঙ্ক ম্যাপিং স্থায়ীভাবে মুছে যাবে।
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowDelete(false)}
                className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-ink"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={() => startTransition(() => { void deleteIntegrationAction(integration.id); })}
                disabled={isPending}
                className="flex-1 rounded-lg bg-error py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                হ্যাঁ, মুছুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
