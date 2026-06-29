"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLandingPageAction } from "../actions";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function NewLandingPageForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const handleSlugChange = (v: string) => {
    setSlug(v);
    setSlugTouched(true);
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createLandingPageAction({ title, slug });
      if (!res.ok) { setError(res.error ?? "ত্রুটি হয়েছে।"); return; }
      router.push(`/admin/landing-pages/${res.id}`);
    });
  };

  return (
    <div className="max-w-lg space-y-4 rounded-lg border border-border bg-surface p-5">
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="space-y-1">
        <label className="block text-sm font-medium text-ink">শিরোনাম</label>
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="যেমন: গ্রীষ্মকালীন সেল"
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-ink">Slug (URL পাথ)</label>
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus-within:border-primary">
          <span className="shrink-0 text-ink-muted">/</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="summer-sale"
            className="min-w-0 flex-1 bg-transparent focus:outline-none"
          />
        </div>
        <p className="text-xs text-ink-muted">শুধু lowercase letters, digits এবং hyphens</p>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !title.trim() || !slug.trim()}
          className="min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          তৈরি করুন
        </button>
        <a
          href="/admin/landing-pages"
          className="inline-flex min-h-[44px] items-center rounded-md border border-border px-5 text-sm text-ink-muted hover:bg-surface-2"
        >
          বাতিল
        </a>
      </div>
    </div>
  );
}
