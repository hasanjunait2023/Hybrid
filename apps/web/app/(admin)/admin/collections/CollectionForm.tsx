"use client";

// Collection create/edit form (DESIGN §P4). Name + product multi-select (search
// + checklist). Posts saveCollection; deleteCollection removes it.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, SearchIcon } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { saveCollection, deleteCollection } from "../products/actions";

export interface CollectionFormProduct {
  id: string;
  title: string;
}

export interface CollectionFormData {
  id?: string;
  title: string;
  description: string;
  memberIds: string[];
}

const inputCls =
  "h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle focus-visible:border-primary";

export function CollectionForm({
  initial,
  products,
}: {
  initial: CollectionFormData;
  products: CollectionFormProduct[];
}) {
  const d = useDict();
  const t = d.admin.collections;
  const router = useRouter();
  const isEdit = Boolean(initial.id);

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [memberIds, setMemberIds] = useState<string[]>(initial.memberIds);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.title.toLowerCase().includes(q));
  }, [products, filter]);

  function toggle(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function submit() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    if (initial.id) fd.set("id", initial.id);
    fd.set("title", title);
    fd.set("description", description);
    fd.set("productIds", JSON.stringify(memberIds));
    startTransition(async () => {
      const result = await saveCollection(null, fd);
      if (!result.ok) setError(result.error ?? t.form.saveFailed);
      else {
        setSaved(true);
        router.refresh();
        if (!isEdit) router.push("/admin/collections");
      }
    });
  }

  function onDelete() {
    if (!initial.id) return;
    const fd = new FormData();
    fd.set("id", initial.id);
    startTransition(() => {
      void deleteCollection(null, fd);
    });
  }

  return (
    <div className="max-w-xl space-y-5">
      <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-semibold text-ink">{d.common.label.name}</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-semibold text-ink">{d.common.label.description}</label>
          <textarea
            id="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-base text-ink focus-visible:border-primary"
          />
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-bold text-ink">{t.form.selectProducts}</h2>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t.form.searchProducts}
            className="h-10 w-full rounded-sm border border-border-strong bg-surface pl-9 pr-3 text-base text-ink focus-visible:border-primary"
          />
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {filtered.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 rounded-sm px-1 py-1.5 text-sm text-ink hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={memberIds.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                {p.title}
              </label>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-1 py-3 text-center text-sm text-ink-muted">{t.form.noProducts}</li>
          )}
        </ul>
      </section>

      {error && (
        <p role="alert" className="rounded-md bg-danger-weak px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-md bg-success-weak px-3 py-2 text-sm font-medium text-success">
          {d.common.action.saved}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? d.common.action.saving : isEdit ? d.common.action.save : t.form.createCollection}
        </Button>
        {isEdit && (
          <Button onClick={onDelete} variant="secondary" disabled={pending} className="text-danger">
            {d.common.action.delete}
          </Button>
        )}
      </div>
    </div>
  );
}
