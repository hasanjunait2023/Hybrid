// Shared empty-state component. Used wherever a list has zero rows. Bilingual
// (en/bn), server-rendered, zero deps.

import type { ReactNode } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";

export function EmptyState({
  icon = "📭",
  title,
  description,
  action,
  locale = "en",
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  locale?: Locale;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="text-4xl" aria-hidden>
        {icon}
      </span>
      <h3 className="mt-3 text-base font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-ink-muted">{description}</p>
      )}
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-ink-on-primary shadow-xs hover:bg-primary-hover"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Pre-built empty state for "no orders". */
export function EmptyOrders({ locale = "en" }: { locale?: Locale }) {
  return (
    <EmptyState
      icon="🛒"
      title={locale === "bn" ? "কোনো অর্ডার নেই" : "No orders yet"}
      description={
        locale === "bn"
          ? "আপনার প্রথম অর্ডার পেলে এখানে দেখাবে।"
          : "When your first order arrives, it will appear here."
      }
      action={{
        label: locale === "bn" ? "ম্যানুয়াল অর্ডার যোগ করুন" : "Add manual order",
        href: "/admin/orders/new",
      }}
      locale={locale}
    />
  );
}

/** Pre-built empty state for "no products". */
export function EmptyProducts({ locale = "en" }: { locale?: Locale }) {
  return (
    <EmptyState
      icon="📦"
      title={locale === "bn" ? "কোনো পণ্য নেই" : "No products yet"}
      description={
        locale === "bn"
          ? "আপনার ক্যাটালগে পণ্য যোগ করুন।"
          : "Add products to your catalog to start selling."
      }
      action={{
        label: locale === "bn" ? "পণ্য যোগ করুন" : "Add product",
        href: "/admin/products/new",
      }}
      locale={locale}
    />
  );
}

/** Pre-built empty state for "no customers". */
export function EmptyCustomers({ locale = "en" }: { locale?: Locale }) {
  return (
    <EmptyState
      icon="👥"
      title={locale === "bn" ? "কোনো গ্রাহক নেই" : "No customers yet"}
      description={
        locale === "bn"
          ? "অর্ডার আসলে গ্রাহকরা এখানে দেখাবে।"
          : "Customers will appear here as orders come in."
      }
      locale={locale}
    />
  );
}

/** Pre-built empty state for "no returns". */
export function EmptyReturns({ locale = "en" }: { locale?: Locale }) {
  return (
    <EmptyState
      icon="↩️"
      title={locale === "bn" ? "কোনো রিটার্ন নেই" : "No returns"}
      description={
        locale === "bn"
          ? "রিটার্ন রিকোয়েস্ট এখানে দেখাবে।"
          : "Return requests will appear here."
      }
      locale={locale}
    />
  );
}

/** Pre-built empty state for "no reviews". */
export function EmptyReviews({ locale = "en" }: { locale?: Locale }) {
  return (
    <EmptyState
      icon="⭐"
      title={locale === "bn" ? "কোনো রিভিউ নেই" : "No reviews yet"}
      description={
        locale === "bn"
          ? "গ্রাহকরা রিভিউ দিলে এখানে দেখাবে।"
          : "Customer reviews will appear here."
      }
      locale={locale}
    />
  );
}

/** Pre-built empty state for "no discounts". */
export function EmptyDiscounts({ locale = "en" }: { locale?: Locale }) {
  return (
    <EmptyState
      icon="🎟️"
      title={locale === "bn" ? "কোনো ডিসকাউন্ট নেই" : "No discounts"}
      description={
        locale === "bn"
          ? "কুপন বা অফার কোড তৈরি করুন।"
          : "Create coupon codes or special offers."
      }
      action={{
        label: locale === "bn" ? "নতুন ডিসকাউন্ট" : "New discount",
        href: "/admin/discounts/new",
      }}
      locale={locale}
    />
  );
}