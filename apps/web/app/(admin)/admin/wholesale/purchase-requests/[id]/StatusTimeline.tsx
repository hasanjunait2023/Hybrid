"use client";

// Status timeline for purchase request lifecycle.
import { useDict } from "@/lib/i18n/provider";

const STATUS_ORDER = ["draft", "submitted", "quoted", "accepted", "converted"] as const;

export function StatusTimeline({
  status,
  createdAt,
}: {
  status: string;
  createdAt: string;
}) {
  const d = useDict();
  const t = d.admin.wholesale.purchaseRequests;
  const currentIdx = STATUS_ORDER.indexOf(status as (typeof STATUS_ORDER)[number]);

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-bold text-ink">{t.detail.statusTimeline}</h2>
      <div className="space-y-0">
        {STATUS_ORDER.map((s, i) => {
          const isPast = i <= currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={s} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold ${
                    isPast
                      ? "bg-primary text-white"
                      : "bg-surface-2 text-ink-muted"
                  }`}
                >
                  {isPast ? "✓" : i + 1}
                </div>
                {i < STATUS_ORDER.length - 1 && (
                  <div
                    className={`h-4 w-0.5 ${
                      i < currentIdx ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
              </div>
              <div className={`pb-4 ${isCurrent ? "font-semibold text-ink" : "text-ink-muted"}`}>
                <p className="text-sm">
                  {t.statusLabels[s as keyof typeof t.statusLabels] ?? s}
                </p>
                {isCurrent && (
                  <p className="text-2xs">{new Date(createdAt).toLocaleDateString()}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
