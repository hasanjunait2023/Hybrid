"use client";

import { useState, useTransition } from "react";
import type { LpBlock, FunnelConfig, LandingPageDetail, PostCheckoutUpsell, LpAbStats } from "@/lib/admin/landingPages";
import {
  updateLandingPageAction,
  publishLandingPageAction,
  unpublishLandingPageAction,
  archiveLandingPageAction,
} from "../actions";

type BlockType = LpBlock["type"];

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validateBlockUrls(blocks: LpBlock[]): string | null {
  for (const block of blocks) {
    if (block.type === "hero") {
      if (block.cta_url && !isHttpUrl(block.cta_url)) return "Hero CTA URL: http বা https দরকার।";
      if (block.image_url && !isHttpUrl(block.image_url)) return "Hero ছবির URL: http বা https দরকার।";
    }
    if (block.type === "image" && block.url && !isHttpUrl(block.url)) return "ছবির URL: http বা https দরকার।";
    if (block.type === "cta" && block.url && !isHttpUrl(block.url)) return "CTA URL: http বা https দরকার।";
  }
  return null;
}

const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Hero ব্যানার",
  text: "টেক্সট",
  image: "ছবি",
  cta: "CTA বাটন",
};

function emptyBlock(type: BlockType): LpBlock {
  if (type === "hero") return { type: "hero", title: "", subtitle: "", cta_text: "", cta_url: "" };
  if (type === "text") return { type: "text", content: "" };
  if (type === "image") return { type: "image", url: "", alt: "" };
  return { type: "cta", text: "", url: "" };
}

function BlockFields({
  block,
  onChange,
}: {
  block: LpBlock;
  onChange: (b: LpBlock) => void;
}) {
  if (block.type === "hero") {
    return (
      <div className="space-y-2">
        <input className={INPUT} placeholder="শিরোনাম" value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} />
        <input className={INPUT} placeholder="সাবটাইটেল" value={block.subtitle} onChange={(e) => onChange({ ...block, subtitle: e.target.value })} />
        <input className={INPUT} placeholder="CTA টেক্সট" value={block.cta_text} onChange={(e) => onChange({ ...block, cta_text: e.target.value })} />
        <input className={INPUT} placeholder="CTA URL" value={block.cta_url} onChange={(e) => onChange({ ...block, cta_url: e.target.value })} />
        <input className={INPUT} placeholder="ছবির URL (ঐচ্ছিক)" value={block.image_url ?? ""} onChange={(e) => onChange({ ...block, image_url: e.target.value || undefined })} />
      </div>
    );
  }
  if (block.type === "text") {
    return (
      <textarea
        className={`${INPUT} min-h-[80px] resize-y`}
        placeholder="টেক্সট কনটেন্ট"
        value={block.content}
        onChange={(e) => onChange({ ...block, content: e.target.value })}
      />
    );
  }
  if (block.type === "image") {
    return (
      <div className="space-y-2">
        <input className={INPUT} placeholder="ছবির URL" value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} />
        <input className={INPUT} placeholder="Alt টেক্সট" value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <input className={INPUT} placeholder="বাটন টেক্সট" value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />
      <input className={INPUT} placeholder="URL" value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} />
    </div>
  );
}

const INPUT =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none";

interface Props {
  page: LandingPageDetail;
  abStats?: LpAbStats;
}

interface Upsell {
  label: string;
  bump_price: number;
}

export function BlockEditor({ page, abStats }: Props) {
  const [title, setTitle] = useState(page.title ?? "");
  const [slug, setSlug] = useState(page.slug);
  const [blocks, setBlocks] = useState<LpBlock[]>(page.blocks);
  const [thankYouUrl, setThankYouUrl] = useState(page.funnelConfig.thank_you_url ?? "");
  const [upsells, setUpsells] = useState<Upsell[]>(page.funnelConfig.upsells ?? []);
  const [pcUpsell, setPcUpsell] = useState<PostCheckoutUpsell | null>(
    page.funnelConfig.post_checkout_upsell ?? null,
  );
  const existingAb = page.funnelConfig.ab_test;
  const [abEnabled, setAbEnabled] = useState(existingAb?.enabled ?? false);
  const [abVariantBlocks, setAbVariantBlocks] = useState<LpBlock[]>(existingAb?.variant_blocks ?? []);
  const [abSplitPct, setAbSplitPct] = useState(existingAb?.split_pct ?? 50);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState(page.status);
  const [pending, startTransition] = useTransition();

  const addUpsell = () => setUpsells((prev) => [...prev, { label: "", bump_price: 0 }]);
  const removeUpsell = (i: number) => setUpsells((prev) => prev.filter((_, idx) => idx !== i));
  const setUpsell = (i: number, field: keyof Upsell, val: string | number) =>
    setUpsells((prev) => prev.map((u, idx) => idx === i ? { ...u, [field]: val } : u));

  const addBlock = (type: BlockType) => {
    setBlocks((prev) => [...prev, emptyBlock(type)]);
    setSaved(false);
  };

  const updateBlock = (i: number, b: LpBlock) => {
    setBlocks((prev) => prev.map((x, idx) => (idx === i ? b : x)));
    setSaved(false);
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    setBlocks((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
      return next;
    });
    setSaved(false);
  };

  const moveDown = (i: number) => {
    setBlocks((prev) => {
      if (i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
      return next;
    });
    setSaved(false);
  };

  const removeBlock = (i: number) => {
    setBlocks((prev) => prev.filter((_, idx) => idx !== i));
    setSaved(false);
  };

  const save = () => {
    setError(null);
    setSaved(false);
    const blockErr = validateBlockUrls(blocks);
    if (blockErr) { setError(blockErr); return; }
    const abErr = abEnabled ? validateBlockUrls(abVariantBlocks) : null;
    if (abErr) { setError(abErr); return; }
    startTransition(async () => {
      const fc: FunnelConfig = {
        thank_you_url: thankYouUrl || undefined,
        upsells: upsells.filter((u) => u.label.trim()).length > 0
          ? upsells.filter((u) => u.label.trim())
          : undefined,
        post_checkout_upsell: pcUpsell?.variant_id.trim() ? pcUpsell : undefined,
        ab_test: abEnabled && abVariantBlocks.length > 0
          ? { enabled: true, variant_blocks: abVariantBlocks, split_pct: abSplitPct }
          : undefined,
      };
      const res = await updateLandingPageAction(page.id, {
        title: title || undefined,
        slug,
        blocks: JSON.stringify(blocks),
        funnelConfig: JSON.stringify(fc),
      });
      if (!res.ok) { setError(res.error ?? "সংরক্ষণ ব্যর্থ।"); return; }
      setSaved(true);
    });
  };

  const publish = () => {
    startTransition(async () => {
      const res = await publishLandingPageAction(page.id);
      if (!res.ok) { setError(res.error ?? "প্রকাশ ব্যর্থ।"); return; }
      setStatus("published");
    });
  };

  const unpublish = () => {
    startTransition(async () => {
      const res = await unpublishLandingPageAction(page.id);
      if (!res.ok) { setError(res.error ?? "ত্রুটি হয়েছে।"); return; }
      setStatus("draft");
    });
  };

  const archive = () => {
    if (!confirm("এই পেজটি আর্কাইভ করবেন?")) return;
    startTransition(async () => {
      await archiveLandingPageAction(page.id);
    });
  };

  return (
    <div className="space-y-5">
      {error ? <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {saved ? <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">সংরক্ষিত হয়েছে।</p> : null}

      {/* Meta fields */}
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-ink">পেজ তথ্য</p>
        <div className="space-y-1">
          <label className="block text-xs text-ink-muted">শিরোনাম</label>
          <input className={INPUT} value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-ink-muted">Slug</label>
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-2 text-sm focus-within:border-primary">
            <span className="text-ink-muted">/</span>
            <input
              className="min-w-0 flex-1 bg-transparent focus:outline-none"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSaved(false); }}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-xs text-ink-muted">Thank-you URL (অর্ডারের পরে redirect)</label>
          <input className={INPUT} placeholder="https://example.com/thank-you" value={thankYouUrl} onChange={(e) => { setThankYouUrl(e.target.value); setSaved(false); }} />
        </div>
      </div>

      {/* Upsells / Order Bumps */}
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">অর্ডার বাম্প / Upsell ({upsells.length})</p>
          <button
            type="button"
            onClick={addUpsell}
            disabled={pending}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            + যোগ করুন
          </button>
        </div>
        <p className="text-xs text-ink-muted">চেকআউটে অতিরিক্ত অফার দেখানো হবে। বায়ার টিক দিলে এই মূল্য যোগ হয়।</p>
        {upsells.map((u, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className={`${INPUT} flex-1`}
              placeholder="অফারের নাম (যেমন: এক্সট্রা ওয়ারেন্টি)"
              value={u.label}
              onChange={(e) => { setUpsell(i, "label", e.target.value); setSaved(false); }}
            />
            <input
              type="number"
              min={0}
              className={`${INPUT} w-28`}
              placeholder="মূল্য (৳)"
              value={u.bump_price || ""}
              onChange={(e) => { setUpsell(i, "bump_price", Number(e.target.value)); setSaved(false); }}
            />
            <button
              type="button"
              onClick={() => { removeUpsell(i); setSaved(false); }}
              disabled={pending}
              className="shrink-0 text-xs text-danger hover:underline disabled:opacity-50"
            >
              মুছুন
            </button>
          </div>
        ))}
      </div>

      {/* Post-checkout one-click upsell */}
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">পোস্ট-চেকআউট আপসেল (অর্ডারের পরে অফার)</p>
          {pcUpsell ? (
            <button
              type="button"
              onClick={() => { setPcUpsell(null); setSaved(false); }}
              disabled={pending}
              className="text-xs text-danger hover:underline disabled:opacity-50"
            >
              মুছুন
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPcUpsell({ variant_id: "", title: "", price: 0 });
                setSaved(false);
              }}
              disabled={pending}
              className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              + যোগ করুন
            </button>
          )}
        </div>
        <p className="text-xs text-ink-muted">অর্ডার কনফার্মের সাথে সাথে বায়ারকে একটি বিশেষ অফার দেখানো হবে। "YES" ক্লিক করলে নতুন অর্ডার তৈরি হবে।</p>
        {pcUpsell && (
          <div className="space-y-2">
            <input
              className={INPUT}
              placeholder="ভেরিয়েন্ট UUID (product_variant.id)"
              value={pcUpsell.variant_id}
              onChange={(e) => { setPcUpsell({ ...pcUpsell, variant_id: e.target.value }); setSaved(false); }}
            />
            <input
              className={INPUT}
              placeholder="অফারের শিরোনাম (যেমন: প্রিমিয়াম কভার)"
              value={pcUpsell.title}
              onChange={(e) => { setPcUpsell({ ...pcUpsell, title: e.target.value }); setSaved(false); }}
            />
            <input
              type="number"
              min={0}
              className={INPUT}
              placeholder="বিশেষ মূল্য (৳)"
              value={pcUpsell.price || ""}
              onChange={(e) => { setPcUpsell({ ...pcUpsell, price: Number(e.target.value) }); setSaved(false); }}
            />
            <input
              className={INPUT}
              placeholder="ছোট বিবরণ (ঐচ্ছিক)"
              value={pcUpsell.description ?? ""}
              onChange={(e) => { setPcUpsell({ ...pcUpsell, description: e.target.value || undefined }); setSaved(false); }}
            />
            <input
              className={INPUT}
              placeholder="ছবির URL (ঐচ্ছিক)"
              value={pcUpsell.image_url ?? ""}
              onChange={(e) => { setPcUpsell({ ...pcUpsell, image_url: e.target.value || undefined }); setSaved(false); }}
            />
          </div>
        )}
      </div>

      {/* A/B Test panel */}
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">A/B টেস্ট</p>
          <button
            type="button"
            onClick={() => { setAbEnabled((v) => !v); setSaved(false); }}
            disabled={pending}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${abEnabled ? "bg-primary" : "bg-border"}`}
            role="switch"
            aria-checked={abEnabled}
          >
            <span className={`inline-block h-4 w-4 translate-x-1 rounded-full bg-white shadow transition-transform ${abEnabled ? "translate-x-6" : ""}`} />
          </button>
        </div>
        <p className="text-xs text-ink-muted">চালু হলে ভিজিটরদের দুটি সংস্করণে ভাগ করা হবে: Variant A (মূল) ও Variant B (বিকল্প)। প্রতিটির ভিউ ও কনভার্শন ট্র্যাক করা হবে।</p>

        {abEnabled && (
          <div className="space-y-4 pt-2">
            {/* Split ratio */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-ink-muted w-28 shrink-0">Variant B ট্রাফিক</label>
              <input
                type="range"
                min={10}
                max={90}
                step={10}
                value={abSplitPct}
                onChange={(e) => { setAbSplitPct(Number(e.target.value)); setSaved(false); }}
                className="flex-1"
              />
              <span className="w-10 text-right text-xs font-mono text-ink">{abSplitPct}%</span>
            </div>

            {/* Stats display */}
            {abStats && (abStats.a.views > 0 || abStats.b.views > 0) && (
              <div className="grid grid-cols-2 gap-2 rounded-md bg-surface-2 p-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-ink">Variant A (মূল)</p>
                  <p className="text-xs text-ink-muted">{abStats.a.views} ভিউ · {abStats.aOrders} অর্ডার</p>
                  <p className="text-sm font-bold text-primary">{(abStats.aConvRate * 100).toFixed(1)}% CVR</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-ink">Variant B</p>
                  <p className="text-xs text-ink-muted">{abStats.b.views} ভিউ · {abStats.bOrders} অর্ডার</p>
                  <p className={`text-sm font-bold ${abStats.bConvRate >= abStats.aConvRate ? "text-success" : "text-danger"}`}>
                    {(abStats.bConvRate * 100).toFixed(1)}% CVR
                    {abStats.aConvRate > 0 && (
                      <span className="ml-1 text-xs font-normal text-ink-muted">
                        ({abStats.bConvRate >= abStats.aConvRate ? "+" : ""}{((abStats.bConvRate - abStats.aConvRate) * 100).toFixed(1)}pp)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Variant B block editor */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-ink">Variant B ব্লক ({abVariantBlocks.length})</p>
              {abVariantBlocks.map((block, i) => (
                <div key={i} className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                      {BLOCK_LABELS[block.type]}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (i === 0) return;
                          const next = [...abVariantBlocks];
                          [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                          setAbVariantBlocks(next); setSaved(false);
                        }}
                        disabled={i === 0 || pending}
                        className="text-xs text-ink-muted hover:text-ink disabled:opacity-30"
                      >↑</button>
                      <button
                        type="button"
                        onClick={() => {
                          if (i >= abVariantBlocks.length - 1) return;
                          const next = [...abVariantBlocks];
                          [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
                          setAbVariantBlocks(next); setSaved(false);
                        }}
                        disabled={i === abVariantBlocks.length - 1 || pending}
                        className="text-xs text-ink-muted hover:text-ink disabled:opacity-30"
                      >↓</button>
                      <button
                        type="button"
                        onClick={() => { setAbVariantBlocks((prev) => prev.filter((_, idx) => idx !== i)); setSaved(false); }}
                        disabled={pending}
                        className="text-xs text-danger hover:underline disabled:opacity-50"
                      >মুছুন</button>
                    </div>
                  </div>
                  <BlockFields
                    block={block}
                    onChange={(b) => { setAbVariantBlocks((prev) => prev.map((x, idx) => idx === i ? b : x)); setSaved(false); }}
                  />
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setAbVariantBlocks((prev) => [...prev, emptyBlock(type)]); setSaved(false); }}
                    disabled={pending}
                    className="rounded-md border border-dashed border-primary/40 px-3 py-1.5 text-xs text-primary hover:border-primary disabled:opacity-50"
                  >
                    + {BLOCK_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Blocks */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink">ব্লক A (মূল) ({blocks.length})</p>
        {blocks.map((block, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {BLOCK_LABELS[block.type]}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveUp(i)}
                  disabled={i === 0 || pending}
                  className="text-xs text-ink-muted hover:text-ink disabled:opacity-30"
                  aria-label="উপরে সরান"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(i)}
                  disabled={i === blocks.length - 1 || pending}
                  className="text-xs text-ink-muted hover:text-ink disabled:opacity-30"
                  aria-label="নিচে সরান"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeBlock(i)}
                  disabled={pending}
                  className="text-xs text-danger hover:underline disabled:opacity-50"
                >
                  মুছুন
                </button>
              </div>
            </div>
            <BlockFields block={block} onChange={(b) => updateBlock(i, b)} />
          </div>
        ))}

        {/* Add block */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => addBlock(type)}
              disabled={pending}
              className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-ink-muted hover:border-primary hover:text-primary disabled:opacity-50"
            >
              + {BLOCK_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          সংরক্ষণ করুন
        </button>

        {status === "draft" ? (
          <button
            type="button"
            onClick={publish}
            disabled={pending}
            className="min-h-[44px] rounded-md border border-success bg-success/5 px-5 text-sm font-medium text-success hover:bg-success/10 disabled:opacity-50"
          >
            প্রকাশ করুন
          </button>
        ) : status === "published" ? (
          <button
            type="button"
            onClick={unpublish}
            disabled={pending}
            className="min-h-[44px] rounded-md border border-warning px-5 text-sm font-medium text-warning hover:bg-warning/5 disabled:opacity-50"
          >
            ড্রাফটে ফিরিয়ে নিন
          </button>
        ) : null}

        <button
          type="button"
          onClick={archive}
          disabled={pending}
          className="min-h-[44px] rounded-md border border-border px-5 text-sm font-medium text-ink-muted hover:bg-surface-2 disabled:opacity-50"
        >
          আর্কাইভ করুন
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${
              status === "published"
                ? "bg-success-weak text-success"
                : status === "draft"
                  ? "bg-st-pending-weak text-st-pending"
                  : "bg-surface-2 text-ink-muted"
            }`}
          >
            {status === "published" ? "প্রকাশিত" : status === "draft" ? "ড্রাফট" : "আর্কাইভড"}
          </span>
          <a
            href="/admin/landing-pages"
            className="text-xs text-ink-muted hover:text-primary hover:underline"
          >
            ← সব পেজ
          </a>
        </div>
      </div>
    </div>
  );
}
