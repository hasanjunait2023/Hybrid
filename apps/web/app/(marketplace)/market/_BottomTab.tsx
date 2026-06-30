"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomTab({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 transition-colors ${
        active ? "text-primary" : "text-ink-muted hover:text-primary"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span className={`text-2xs font-medium ${active ? "font-semibold" : ""}`}>{label}</span>
    </Link>
  );
}
