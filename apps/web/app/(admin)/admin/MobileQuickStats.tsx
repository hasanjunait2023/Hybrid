// Mobile-optimized quick stats — single horizontal scroll strip showing the
// most important KPIs. Designed for one-thumb access on phones (≥ 44px tap
// targets, no horizontal overflow, snaps to card widths).

import type { Locale } from "@/lib/i18n/config";
import { formatMoney, formatNumber } from "@/lib/i18n/format";

export function MobileQuickStats({
  todayOrders,
  todayRevenue,
  pendingConfirm,
  codPending,
  lowStock,
  locale = "en",
}: {
  todayOrders: number;
  todayRevenue: number;
  pendingConfirm: number;
  codPending: number;
  lowStock: number;
  locale?: Locale;
}) {
  const cards = [
    {
      label: locale === "bn" ? "আজ অর্ডার" : "Today's orders",
      value: formatNumber(todayOrders, locale),
      tone: "default" as const,
      href: "/admin/orders?today=1",
    },
    {
      label: locale === "bn" ? "আজ বিক্রি" : "Today's sales",
      value: formatMoney(todayRevenue, locale),
      tone: "success" as const,
      href: "/admin/reports",
    },
    {
      label: locale === "bn" ? "কনফার্ম অপেক্ষা" : "Awaiting confirm",
      value: formatNumber(pendingConfirm, locale),
      tone: pendingConfirm > 0 ? ("warning" as const) : ("muted" as const),
      href: "/admin/orders?status=pending",
    },
    {
      label: locale === "bn" ? "COD বাকি" : "COD due",
      value: formatMoney(codPending, locale),
      tone: "pending" as const,
      href: "/admin/orders?cod=pending",
    },
    {
      label: locale === "bn" ? "স্টক কম" : "Low stock",
      value: formatNumber(lowStock, locale),
      tone: lowStock > 0 ? ("warning" as const) : ("muted" as const),
      href: "/admin/products?status=active&low_stock=1",
    },
  ];

  const TONE_BG: Record<typeof cards[number]["tone"], string> = {
    default: "bg-surface",
    success: "bg-success-weak",
    warning: "bg-warning-weak",
    pending: "bg-pending-weak",
    muted: "bg-surface-2",
  };
  const TONE_TEXT: Record<typeof cards[number]["tone"], string> = {
    default: "text-ink",
    success: "text-success",
    warning: "text-warning",
    pending: "text-st-pending",
    muted: "text-ink-subtle",
  };

  return (
    <nav
      aria-label={locale === "bn" ? "দ্রুত পরিসংখ্যান" : "Quick stats"}
      className="-mx-4 mb-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:hidden"
    >
      {cards.map((c) => (
        <a
          key={c.href}
          href={c.href}
          className={`flex h-20 w-32 shrink-0 snap-start flex-col justify-between rounded-lg border border-border ${TONE_BG[c.tone]} p-3 shadow-xs active:scale-[0.98]`}
        >
          <p className="text-2xs font-medium text-ink-muted">{c.label}</p>
          <p className={`font-mono text-lg font-bold leading-none tnum ${TONE_TEXT[c.tone]}`}>
            {c.value}
          </p>
        </a>
      ))}
    </nav>
  );
}