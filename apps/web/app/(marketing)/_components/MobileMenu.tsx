"use client";

import { useState } from "react";
import Link from "next/link";

interface MobileMenuProps {
  links: { href: string; label: string }[];
  loginUrl: string;
  loginLabel: string;
  ctaHref: string;
  ctaLabel: string;
  menuLabel: string;
  closeLabel: string;
}

export function MobileMenu({
  links,
  loginUrl,
  loginLabel,
  ctaHref,
  ctaLabel,
  menuLabel,
  closeLabel,
}: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button — only on < lg screens */}
      <button
        type="button"
        aria-label={open ? closeLabel : menuLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-11 w-11 place-items-center rounded-md text-ink-muted transition hover:bg-surface-2 lg:hidden"
      >
        {open ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={menuLabel}
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col bg-bg shadow-2xl transition-transform duration-300 ease-out-soft lg:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-end border-b border-border px-4 py-3">
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => setOpen(false)}
            className="grid h-11 w-11 place-items-center rounded-md text-ink-muted hover:bg-surface-2"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 py-4" aria-label={menuLabel}>
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="bn-body flex min-h-[48px] items-center rounded-md px-4 text-base font-medium text-ink-muted transition hover:bg-surface-2 hover:text-primary"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
          <a
            href={loginUrl}
            onClick={() => setOpen(false)}
            className="bn-body flex min-h-[48px] items-center justify-center rounded-md border border-border-strong px-4 text-sm font-medium text-ink transition hover:bg-surface-2"
          >
            {loginLabel}
          </a>
          <Link
            href={ctaHref}
            onClick={() => setOpen(false)}
            className="flex min-h-[48px] items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </>
  );
}
