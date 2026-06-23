"use client";

// Store profile form (DESIGN §P6). Writes to tenant.name + tenant.settings jsonb.
// Subdomain is read-only (mono). Sticky save enabled only when dirty.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import type { StoreProfile } from "@/lib/admin/settings";
import { saveStoreProfile } from "./actions";

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary";

export function StoreProfileForm({ profile }: { profile: StoreProfile }) {
  const router = useRouter();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [facebook, setFacebook] = useState(profile.facebook);
  const [address, setAddress] = useState(profile.address);
  const [returnPolicy, setReturnPolicy] = useState(profile.returnPolicy);
  const [vatBin, setVatBin] = useState(profile.vatBin);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    name !== profile.name ||
    phone !== profile.phone ||
    facebook !== profile.facebook ||
    address !== profile.address ||
    returnPolicy !== profile.returnPolicy ||
    vatBin !== profile.vatBin;

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("phone", phone);
    fd.set("facebook", facebook);
    fd.set("address", address);
    fd.set("returnPolicy", returnPolicy);
    fd.set("vatBin", vatBin);
    startTransition(async () => {
      const result = await saveStoreProfile(null, fd);
      if (!result.ok) setError(result.error ?? "সেভ ব্যর্থ হয়েছে।");
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-semibold text-ink">দোকানের নাম</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </div>

      {profile.subdomain && (
        <div>
          <span className="mb-1 block text-sm font-semibold text-ink">সাবডোমেইন</span>
          <p className="font-mono text-sm text-ink-muted">{profile.subdomain}</p>
        </div>
      )}

      <div>
        <label htmlFor="phone" className="mb-1 block text-sm font-semibold text-ink">হটলাইন ফোন</label>
        <input
          id="phone"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="facebook" className="mb-1 block text-sm font-semibold text-ink">Facebook লিংক</label>
        <input
          id="facebook"
          value={facebook}
          onChange={(e) => setFacebook(e.target.value)}
          placeholder="https://facebook.com/..."
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="address" className="mb-1 block text-sm font-semibold text-ink">ঠিকানা</label>
        <textarea
          id="address"
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink focus-visible:border-primary"
        />
      </div>

      <div>
        <label htmlFor="returnPolicy" className="mb-1 block text-sm font-semibold text-ink">রিটার্ন পলিসি</label>
        <textarea
          id="returnPolicy"
          rows={3}
          value={returnPolicy}
          onChange={(e) => setReturnPolicy(e.target.value)}
          className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink focus-visible:border-primary"
        />
      </div>

      <div>
        <label htmlFor="vatBin" className="mb-1 block text-sm font-semibold text-ink">VAT / BIN</label>
        <input
          id="vatBin"
          value={vatBin}
          onChange={(e) => setVatBin(e.target.value)}
          className={`${inputCls} font-mono`}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-md bg-success-weak px-3 py-2 text-sm font-medium text-success">
          সেভ হয়েছে।
        </p>
      )}

      <Button onClick={save} disabled={pending || !dirty}>
        {pending ? "সেভ হচ্ছে…" : "সেভ করুন"}
      </Button>
    </section>
  );
}
