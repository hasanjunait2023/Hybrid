"use client";

// Store page create/edit form. Plain-text body (no rich-text/HTML — rendered
// whitespace-preserved on the storefront). Save + delete via Server Actions.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@hybrid/ui";
import { savePageAction, deletePageAction } from "../actions";
import type { StorePageEdit } from "@/lib/admin/pages";

export function PageForm({ page }: { page: StorePageEdit | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState(page?.slug ?? "");

  const save = (fd: FormData) => {
    setError(null);
    const raw = {
      id: page?.id ?? null,
      slug: String(fd.get("slug") ?? ""),
      title: String(fd.get("title") ?? ""),
      body: String(fd.get("body") ?? ""),
      status: String(fd.get("status") ?? "draft"),
      seoTitle: String(fd.get("seoTitle") ?? ""),
      seoDescription: String(fd.get("seoDescription") ?? ""),
    };
    start(async () => {
      const res = await savePageAction(raw);
      if (!res.ok) {
        setError(res.error ?? "সেভ করা যায়নি।");
        return;
      }
      router.push("/admin/settings/pages");
      router.refresh();
    });
  };

  const remove = () => {
    if (!page) return;
    if (!confirm("পেজটি মুছে ফেলবেন?")) return;
    start(async () => {
      const res = await deletePageAction(page.id);
      if (!res.ok) {
        setError(res.error ?? "মুছে ফেলা যায়নি।");
        return;
      }
      router.push("/admin/settings/pages");
      router.refresh();
    });
  };

  return (
    <form action={save} className="space-y-4">
      <Field label="শিরোনাম">
        <input
          name="title"
          required
          defaultValue={page?.title ?? ""}
          className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm"
        />
      </Field>

      <Field label="স্লাগ (URL)" hint={`/pages/${slug || "..."}`}>
        <input
          name="slug"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="returns"
          className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 font-mono text-sm"
        />
      </Field>

      <Field label="বিষয়বস্তু">
        <textarea
          name="body"
          rows={12}
          defaultValue={page?.body ?? ""}
          className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed"
        />
      </Field>

      <Field label="স্ট্যাটাস">
        <select
          name="status"
          defaultValue={page?.status ?? "draft"}
          className="h-10 rounded-md border border-border-strong bg-surface px-2 text-sm"
        >
          <option value="draft">খসড়া</option>
          <option value="published">প্রকাশিত</option>
        </select>
      </Field>

      <details className="rounded-md border border-border bg-surface-2 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-ink-muted">SEO (ঐচ্ছিক)</summary>
        <div className="mt-3 space-y-3">
          <Field label="SEO শিরোনাম">
            <input
              name="seoTitle"
              defaultValue={page?.seoTitle ?? ""}
              className="h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm"
            />
          </Field>
          <Field label="SEO বর্ণনা">
            <textarea
              name="seoDescription"
              rows={2}
              defaultValue={page?.seoDescription ?? ""}
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </details>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "…" : "সেভ করুন"}
        </Button>
        {page && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="text-sm font-semibold text-danger hover:underline disabled:opacity-50"
          >
            মুছে ফেলুন
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="font-mono text-xs text-ink-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
