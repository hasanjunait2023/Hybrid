"use client";

// Custom domain connect UI (DESIGN §Q5). Add domain → DNS records (CopyField
// rows) → 3-step status stepper → set primary. Calm, copy-able guidance + honest
// timing so a non-technical seller doesn't panic. The live subdomain is always
// shown as a permanent fallback so the seller never lacks a working URL.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, CopyField } from "@hybrid/ui";
import type { DomainsView, CustomDomainView } from "@/lib/domains/data";
import type { DomainState } from "@/lib/domains/state";
import {
  addCustomDomain,
  checkDomainStatus,
  retryDomain,
  setPrimaryDomain,
  removeCustomDomain,
} from "./actions";

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 font-mono text-sm text-ink placeholder:text-ink-subtle focus-visible:border-primary focus-visible:outline-none";

export function DomainsManager({ view }: { view: DomainsView }) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    const fd = new FormData();
    fd.set("domain", domain.trim());
    startTransition(async () => {
      const result = await addCustomDomain(null, fd);
      if (!result.ok) setError(result.error ?? "যোগ করা যায়নি।");
      else {
        setDomain("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Always-present fallback subdomain */}
      {view.subdomain && (
        <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">আপনার সাবডোমেইন (সবসময় কাজ করবে)</h2>
          <CopyField value={view.subdomain} chip="URL" />
        </section>
      )}

      {/* Add domain */}
      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <label htmlFor="domain" className="block text-sm font-semibold text-ink">
          আপনার ডোমেইন
        </label>
        <input
          id="domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="yourstore.com"
          inputMode="url"
          autoComplete="off"
          className={inputCls}
        />
        <p className="text-xs text-ink-muted">http:// বা www ছাড়া শুধু ডোমেইনটি লিখুন।</p>
        {error && (
          <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <Button onClick={add} disabled={pending || !domain.trim()}>
          {pending ? "যোগ হচ্ছে…" : "যোগ করুন"}
        </Button>
      </section>

      {/* Existing custom domains */}
      {view.custom.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-ink-muted">
          এখনো কোনো কাস্টম ডোমেইন যোগ করা হয়নি। আপনার নিজের ডোমেইন যোগ করুন (যেমন yourstore.com)।
        </p>
      ) : (
        <ul className="space-y-4">
          {view.custom.map((d) => (
            <DomainCard key={d.id} domain={d} />
          ))}
        </ul>
      )}
    </div>
  );
}

const STEP_META: Record<
  DomainState,
  { label: string; sub?: string; tone: "pending" | "verified" | "live" | "failed" }
> = {
  pending_dns: { label: "DNS-এর অপেক্ষায়", tone: "pending" },
  dns_verified: {
    label: "DNS মিলেছে · SSL তৈরি হচ্ছে",
    sub: "🔒 সার্টিফিকেট আসছে (২–১০ মিনিট)",
    tone: "verified",
  },
  ssl_issued: { label: "✓ লাইভ · নিরাপদ (HTTPS)", tone: "live" },
  failed: { label: "সংযোগ ব্যর্থ", tone: "failed" },
};

const TONE_CLS: Record<string, string> = {
  pending: "bg-warning-weak text-warning",
  verified: "bg-primary-weak text-primary",
  live: "bg-success-weak text-success",
  failed: "bg-danger-weak text-danger",
};

function DomainCard({ domain }: { domain: CustomDomainView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const meta = STEP_META[domain.state];

  function run(fn: typeof checkDomainStatus, extra?: Record<string, string>) {
    setError(null);
    const fd = new FormData();
    fd.set("id", domain.id);
    if (extra) for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    startTransition(async () => {
      const result = await fn(null, fd);
      if (!result.ok) setError(result.error ?? "অপারেশন ব্যর্থ।");
      else router.refresh();
    });
  }

  return (
    <li className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{domain.domain}</p>
          {domain.isPrimary && (
            <span className="text-2xs font-semibold uppercase text-success">প্রাইমারি</span>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLS[meta.tone]}`}>
          {meta.label}
        </span>
      </div>
      {meta.sub && <p className="text-xs text-ink-muted">{meta.sub}</p>}

      {/* DNS records — shown until the domain is live */}
      {domain.state !== "ssl_issued" && (
        <div className="space-y-3 rounded-md bg-surface-2 p-3">
          <p className="text-xs text-ink-muted">
            আপনার ডোমেইন প্রোভাইডারে (যেমন GoDaddy / Namecheap) নিচের রেকর্ডগুলো যোগ করুন।
          </p>
          {domain.records.map((r) => (
            <CopyField key={`${r.type}-${r.host}`} chip={`${r.type} · ${r.host}`} value={r.value} />
          ))}
          <p className="text-2xs text-ink-subtle">
            CAA রেকর্ড থাকলে <code>0 issue letsencrypt.org</code> যোগ করুন — নাহলে SSL আসবে না।
          </p>
          <p className="rounded-md bg-primary-weak px-3 py-2 text-2xs font-medium text-primary">
            DNS পরিবর্তন ছড়াতে কয়েক ঘণ্টা (কখনো ৪৮ ঘণ্টা পর্যন্ত) লাগতে পারে — এটা স্বাভাবিক। আমরা নিজে
            থেকে চেক করতে থাকব।
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {domain.state === "failed" ? (
          <Button variant="secondary" onClick={() => run(retryDomain)} disabled={pending}>
            আবার চেষ্টা করুন
          </Button>
        ) : domain.state !== "ssl_issued" ? (
          <Button variant="secondary" onClick={() => run(checkDomainStatus)} disabled={pending}>
            {pending ? "চেক হচ্ছে…" : "স্ট্যাটাস চেক করুন"}
          </Button>
        ) : !domain.isPrimary ? (
          <Button onClick={() => run(setPrimaryDomain)} disabled={pending}>
            প্রাইমারি করুন
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => run(removeCustomDomain)} disabled={pending}>
          সরান
        </Button>
      </div>
    </li>
  );
}
