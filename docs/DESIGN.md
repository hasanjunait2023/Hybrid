# Design System — Hybrid

> Single source of visual truth for Hybrid ("Shopify for Bangladesh").
> Read this before any UI/visual decision. Do not deviate without explicit approval.
> Stack: **Next.js (App Router) + Tailwind + shadcn/ui**. Bengali is the **default** language.

---

## 0. Product Context

- **What this is:** A Bengali-first, mobile-first multi-tenant commerce SaaS that lets Bangladeshi F-commerce sellers spin up a real online store (admin + storefront + funnels) in minutes.
- **Who it's for:** Facebook-page sellers (BDT 10k–100k/mo, mobile-only, non-technical) graduating to a real shop, plus growing SMEs and dropshippers. Their **customers** are Bangladeshi buyers who default to Cash-on-Delivery and need to trust the shop before they order.
- **Space:** BD e-commerce / F-commerce. ~78% mobile, low-end Android over 3G, COD ~70–75%, bKash culture.
- **The one thing to remember:** *"This shop is real and safe to order from."* Trust is the conversion currency here — a COD buyer commits money on faith. Every visual decision serves trustworthiness first.

---

## 1. Brand Direction — "Bazaar Modern"

**Name/personality:** **Bazaar Modern** — the warmth and confidence of a well-run Bangladeshi shop, rendered with the discipline of modern software.

Not "clean minimal" (reads as empty/unfinished to a buyer expecting a busy, alive shop). Not default shadcn (reads as a foreign tech demo, not a Bengali store). Not dark-luxury (dark mode reads as low-trust for COD commerce in this market — light is the default).

**The thesis:** Bangladeshi buyers trust shops that feel *established, busy, and proud* — strong color, clear prices, visible trust signals (COD badge, phone number, courier logos), generous Bangla type they can actually read. We pair that cultural warmth with crisp structure, real hierarchy, and fast loading so it feels *premium and credible*, not like another janky Facebook-page-turned-website.

**Mood words:** confident · warm · legible · grounded · fast.

**Material metaphor:** clean paper and ink with one strong color, like a freshly printed price tag or a quality shop signboard — high contrast, no fog, no gimmicks.

### Why this direction for THIS market
1. **Trust over taste-flex.** COD buyers abandon shops that look fragile or empty. Solid surfaces, real borders, visible prices and trust badges read as "real business."
2. **Bangla legibility is the brand.** The type has to be effortless to read on a cheap phone in daylight. Type *is* the trust signal. (See §4.)
3. **Speed is design.** A 1.5s budget on 3G means decoration must be cheap (flat color, system shadows, no heavy imagery-as-chrome). Constraint becomes the aesthetic: confident flat color + type, not gradients and glass.
4. **Differentiated, not generic.** A specific accent (`Sky-blue / আকাশি`) and Bangla-first type make tenant stores recognizably "a Hybrid store" without looking templated.

### Color story
- **Primary — Indigo "নীল" (`#1D4ED8` family):** trust, finance, and "official." Used for CTAs, links, focus. Buyers associate deep blue with banks and reliable services (bKash/Nagad live in the pink/orange space, so blue keeps us distinct from payment-rail branding while still reading as "money-safe").
- **Accent — Marigold "গাঁদা" (`#F59E0B` family):** warmth, festivity, the gold of a price tag and the marigold of every celebration. Used sparingly for highlights, sale tags, ratings. This is the warmth that keeps it from feeling like cold fintech.
- **Trust-green for COD:** a dedicated semantic green so "ক্যাশ অন ডেলিভারি" reads instantly as safe and available.

---

## 2. The Four Surfaces (coherent, differentiated)

All four share the same tokens (§3–§7). They differ in **density, decoration, and color temperature** — one system, four dialects.

| Surface | Personality | Density | Accent use | Notes |
|---|---|---|---|---|
| **Tenant Storefront** | Warm, proud, trustworthy shop | Comfortable | Indigo CTA + marigold tags + visible COD-green | Phase 0 = ONE hardcoded theme; sets the quality bar. Trust signals are first-class UI. |
| **Tenant Admin** | Calm, capable, forgiving | Comfortable→compact | Indigo for primary actions only | Big tap targets, one primary action per screen, Bangla labels, mobile-only seller can run a business one-thumbed. |
| **Platform Super-Admin** | Utilitarian, data-dense | Compact | Indigo minimal; status colors do the talking | Owner tool. Tables, filters, monospace IDs. Denser is fine; still on the same tokens. |
| **Marketing Site** | Persuasive, confident, Bengali | Spacious | Full palette, marigold for energy | Conversion-focused. Bigger type, more whitespace, social proof, pricing in ৳. The "showroom." |

**Differentiation rule:** Storefront and Marketing get *warmth and air* (marigold appears, larger type scale). Admin and Super-Admin get *calm and density* (marigold nearly absent, tighter spacing, status colors carry meaning). Same radius, same fonts, same blue.

---

## 3. Design Tokens

Authored as CSS custom properties in `globals.css`, mapped into the Tailwind theme. All colors are light-first. Dark mode is **not** the default and is out of scope for Phase 0/1 (it reads as lower-trust for COD storefronts; revisit only for admin later).

### 3.1 CSS Custom Properties

```css
:root {
  /* ---- Color: brand ---- */
  --color-primary:        #1D4ED8;  /* Indigo 700 — CTA, links, focus */
  --color-primary-hover:  #1E40AF;  /* Indigo 800 */
  --color-primary-active: #1E3A8A;  /* Indigo 900 */
  --color-primary-weak:   #EFF4FF;  /* indigo tint surface (selected rows, info bg) */

  --color-accent:         #F59E0B;  /* Marigold 500 — sale tags, ratings, highlights */
  --color-accent-hover:   #D97706;  /* Marigold 600 */
  --color-accent-weak:    #FEF3C7;  /* marigold tint (sale badge bg) */

  /* ---- Color: neutrals (warm-tinted, NOT pure gray) ---- */
  --color-bg:             #FBFAF8;  /* warm paper — app/storefront background */
  --color-surface:        #FFFFFF;  /* cards, sheets, inputs */
  --color-surface-2:      #F4F2EE;  /* subtle raised/zebra surface */
  --color-border:         #E7E3DC;  /* hairline borders (warm) */
  --color-border-strong:  #D6D1C7;  /* emphasized dividers, input borders */

  --color-text:           #1A1814;  /* near-black warm ink — primary text */
  --color-text-muted:     #6B6459;  /* secondary text, captions */
  --color-text-subtle:    #9A9286;  /* placeholders, disabled */
  --color-text-on-primary:#FFFFFF;

  /* ---- Color: semantic ---- */
  --color-success:        #15803D;  /* paid/delivered */
  --color-success-weak:   #E7F4EC;
  --color-cod:            #047857;  /* dedicated COD / Cash-on-Delivery trust green */
  --color-cod-weak:       #E6F4EF;
  --color-warning:        #B45309;  /* pending, low stock */
  --color-warning-weak:   #FBEEDC;
  --color-danger:         #B91C1C;  /* cancelled, error, out of stock */
  --color-danger-weak:    #FBE9E9;
  --color-info:           #1D4ED8;  /* = primary */

  /* ---- Typography: families ---- */
  --font-bangla:  "Hind Siliguri", "Noto Sans Bengali", system-ui, sans-serif;
  --font-latin:   "Inter Tight", "Hind Siliguri", system-ui, sans-serif; /* English toggle / Latin runs */
  --font-mono:    "IBM Plex Mono", ui-monospace, monospace;             /* IDs, SKUs, amounts in admin */
  --font-display: "Hind Siliguri", sans-serif;                          /* hero/headline — heavier weights */

  /* ---- Typography: fluid scale (clamp = mobile→desktop) ---- */
  --text-2xs:  0.6875rem;                                  /* 11px — micro labels */
  --text-xs:   0.78rem;                                    /* 12.5px — captions */
  --text-sm:   0.875rem;                                   /* 14px — secondary */
  --text-base: 1rem;                                       /* 16px — body (min for Bangla) */
  --text-lg:   1.1875rem;                                  /* 19px — emphasized body, prices */
  --text-xl:   clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem);    /* section headings */
  --text-2xl:  clamp(1.5rem,  1.3rem + 1vw,   2rem);       /* page titles */
  --text-3xl:  clamp(1.875rem,1.5rem + 1.8vw, 2.75rem);    /* storefront/marketing hero */
  --text-4xl:  clamp(2.25rem, 1.7rem + 2.8vw, 3.75rem);    /* marketing hero only */

  /* ---- Line-height (Bangla needs MORE than Latin) ---- */
  --leading-bangla-tight: 1.45;   /* headings */
  --leading-bangla:       1.7;    /* body — Bangla ascenders/conjuncts need room */
  --leading-latin:        1.5;    /* English-toggle body */
  --leading-none:         1.1;    /* numerals, big display digits */

  /* ---- Spacing: 4px base, 8px rhythm ---- */
  --space-0:  0;
  --space-1:  0.25rem;  /* 4  */
  --space-2:  0.5rem;   /* 8  */
  --space-3:  0.75rem;  /* 12 */
  --space-4:  1rem;     /* 16 — default gap */
  --space-5:  1.25rem;  /* 20 */
  --space-6:  1.5rem;   /* 24 */
  --space-8:  2rem;     /* 32 */
  --space-10: 2.5rem;   /* 40 */
  --space-12: 3rem;     /* 48 */
  --space-16: 4rem;     /* 64 */
  --space-section: clamp(2.5rem, 1.5rem + 5vw, 5rem); /* vertical section rhythm */

  /* ---- Radius (consistent, slightly soft — NOT pill-everything) ---- */
  --radius-sm:   6px;   /* inputs, small chips */
  --radius-md:   10px;  /* buttons, cards (DEFAULT) */
  --radius-lg:   14px;  /* product cards, sheets, modals */
  --radius-xl:   20px;  /* hero panels, marketing blocks */
  --radius-full: 9999px;/* avatars, status dots, ONLY pill = filter chips & badges */

  /* ---- Shadow (cheap, layered, warm — performance-safe) ---- */
  --shadow-xs: 0 1px 2px rgba(26, 24, 20, 0.06);
  --shadow-sm: 0 1px 3px rgba(26, 24, 20, 0.08), 0 1px 2px rgba(26, 24, 20, 0.04);
  --shadow-md: 0 4px 12px rgba(26, 24, 20, 0.08);
  --shadow-lg: 0 10px 28px rgba(26, 24, 20, 0.10);
  --shadow-focus: 0 0 0 3px rgba(29, 78, 216, 0.35); /* focus ring = primary @ 35% */

  /* ---- Motion ---- */
  --ease-out:      cubic-bezier(0.22, 1, 0.36, 1);   /* enter / standard */
  --ease-in:       cubic-bezier(0.4, 0, 1, 1);       /* exit */
  --ease-in-out:   cubic-bezier(0.65, 0, 0.35, 1);   /* move */
  --dur-instant:   100ms;  /* taps, hovers */
  --dur-fast:      180ms;  /* most transitions */
  --dur-base:      260ms;  /* sheets, dropdowns */
  --dur-slow:      400ms;  /* page/section entrance (sparingly) */

  /* ---- Z-index ---- */
  --z-base:        0;
  --z-sticky:      10;   /* sticky header, mobile bottom bar */
  --z-dropdown:    1000;
  --z-overlay:     1100; /* backdrop */
  --z-modal:       1200; /* sheets, dialogs */
  --z-toast:       1300;
  --z-tooltip:     1400;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 3.2 Tailwind theme mapping

```ts
// tailwind.config.ts (theme.extend)
export default {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          active: "var(--color-primary-active)",
          weak: "var(--color-primary-weak)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          weak: "var(--color-accent-weak)",
        },
        bg: "var(--color-bg)",
        surface: { DEFAULT: "var(--color-surface)", 2: "var(--color-surface-2)" },
        border: { DEFAULT: "var(--color-border)", strong: "var(--color-border-strong)" },
        ink: {
          DEFAULT: "var(--color-text)",
          muted: "var(--color-text-muted)",
          subtle: "var(--color-text-subtle)",
        },
        success: { DEFAULT: "var(--color-success)", weak: "var(--color-success-weak)" },
        cod:     { DEFAULT: "var(--color-cod)",     weak: "var(--color-cod-weak)" },
        warning: { DEFAULT: "var(--color-warning)", weak: "var(--color-warning-weak)" },
        danger:  { DEFAULT: "var(--color-danger)",  weak: "var(--color-danger-weak)" },
      },
      fontFamily: {
        bangla:  ["var(--font-bangla)"],
        latin:   ["var(--font-latin)"],
        display: ["var(--font-display)"],
        mono:    ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)", md: "var(--radius-md)",
        lg: "var(--radius-lg)", xl: "var(--radius-xl)", full: "var(--radius-full)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)", sm: "var(--shadow-sm)",
        md: "var(--shadow-md)", lg: "var(--shadow-lg)",
      },
      transitionTimingFunction: {
        "out-soft": "var(--ease-out)", "in-soft": "var(--ease-in)", "move": "var(--ease-in-out)",
      },
    },
  },
};
```

---

## 4. Bangla Typography (the make-or-break)

### 4.1 Font choice — **Hind Siliguri** (primary), Noto Sans Bengali (fallback)

**Decision: Hind Siliguri for all Bangla.** Reasons, in priority order:

1. **Built for UI.** Hind Siliguri (Indian Type Foundry) was designed explicitly for user-interface use — humanist construction with near-monolinear strokes, 820 glyphs including the full set of Bengali conjuncts (যুক্তাক্ষর). Conjunct coverage is non-negotiable: a font that breaks on common conjuncts looks broken/cheap, which kills trust. ([source](https://fonts.adobe.com/fonts/hind-siliguri))
2. **It's the market's trust font.** Hind Siliguri renders the way Bangladeshi readers expect from textbooks and quality apps; it is the de-facto Bangla web UI font in BD (whole plugins exist just to swap Noto for it). Familiarity reads as legitimacy. ([source](https://github.com/font-freak/bn_HindSiliguri))
3. **Weights we need, no more.** Ships 300/400/500/600/700. We use **400 / 500 / 600 / 700** only. Subsetting to Bengali + Latin keeps each weight small.
4. **Renders cleanly on low-end Android.** Monolinear strokes hold up at small sizes and low DPI better than modulated/serif options (Noto Serif Bengali, Tiro Bangla) — critical for a cheap phone in daylight.

**Why not the others:**
- **Noto Sans Bengali** — excellent, neutral, ships as fallback; but more generic and slightly less "warm/local." Keep as the metric-compatible fallback so layout doesn't shift if Hind Siliguri is slow. ([source](https://fonts.google.com/noto/specimen/Noto+Sans+Bengali))
- **Anek Bangla** — modern and clean, variable font, but its display-ish personality is less neutral for dense admin tables; reserve as an optional future display face, not the workhorse.
- **Tiro / Noto Serif Bengali** — literary/serif; beautiful for books, wrong for fast mobile commerce UI.

### 4.2 Loading strategy (performance-critical)

- **Self-host** Hind Siliguri (woff2), do **not** hot-link Google Fonts (extra DNS/connection on 3G). Use `next/font/local`.
- **Subset** to `bengali` + `latin` + `latin-ext`. Drop unused weights.
- `font-display: swap` with **Noto Sans Bengali as a metric-matched fallback** to minimize layout shift (CLS budget < 0.1).
- **Preload only weight 400 + 600** (body + the weight headings/prices use). Other weights load lazily.
- Target: Bangla body weight woff2 ≈ 30–60KB subset. Keep total font payload ≤ ~120KB.

```ts
// app/fonts.ts
import localFont from "next/font/local";
export const hindSiliguri = localFont({
  src: [
    { path: "./fonts/HindSiliguri-Regular.woff2",  weight: "400", style: "normal" },
    { path: "./fonts/HindSiliguri-Medium.woff2",   weight: "500", style: "normal" },
    { path: "./fonts/HindSiliguri-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/HindSiliguri-Bold.woff2",     weight: "700", style: "normal" },
  ],
  variable: "--font-bangla",
  display: "swap",
  preload: true,
  fallback: ["Noto Sans Bengali", "system-ui", "sans-serif"],
});
```

### 4.3 Line-height & spacing for Bangla

Bangla has tall ascenders, the headline mātrā (the top bar), and stacked conjuncts. It **needs more leading than Latin**:

- **Body Bangla:** `line-height: 1.7` (`--leading-bangla`). Never below 1.6 for paragraph text.
- **Headings Bangla:** `line-height: 1.45` (`--leading-bangla-tight`).
- **Letter-spacing:** `0` always. Never track-out Bangla — it breaks conjunct joins and the mātrā continuity.
- **Min body size:** `16px` (`--text-base`). Do not set Bangla body below 16px on mobile; 14px is the floor for secondary/caption text only.
- **Mixed runs:** When Bangla and Latin/digits sit on one line (e.g., "৳৪৯৯ থেকে"), the shared 1.7 leading on the block keeps baselines comfortable; Hind Siliguri's Latin is well-matched so no per-run override needed.

```css
.bn-body    { font-family: var(--font-bangla); line-height: var(--leading-bangla); letter-spacing: 0; }
.bn-heading { font-family: var(--font-bangla); line-height: var(--leading-bangla-tight); letter-spacing: 0; font-weight: 700; }
```

### 4.4 Numerals — **recommendation: Bangla digits on storefront, Latin digits in admin**

This is a deliberate split, not laziness:

- **Storefront (customer-facing):** render **Bangla numerals** (৳৪৯৯, ০১৭xxxxxxxx, ০৳ shipping) by default. Bangladeshi buyers read prices and phone numbers natively in Bangla digits; it reinforces "this is a local, trustworthy shop." Provide a formatter `toBnDigits(n)` and use it for all storefront prices, quantities, phone numbers, dates.
- **Admin & Super-Admin (operator-facing):** render **Latin numerals** (499, 01712…, SKU/order IDs). Sellers doing data entry, reconciliation, and courier IDs are faster and less error-prone with Latin digits; SKUs/IDs are inherently Latin. Money in admin uses `--font-mono` + `tabular-nums` for column alignment.
- **Always** keep the underlying value Latin in the DB; convert at the view layer only. Phone input accepts both and normalizes to Latin.
- Use `font-feature-settings: "tnum" 1;` (tabular numerals) wherever numbers align in columns (order tables, reconciliation, dashboards).

```ts
const BN = "০১২৩৪৫৬৭৮৯";
export const toBnDigits = (s: string | number) =>
  String(s).replace(/[0-9]/g, d => BN[+d]);
// ৳ price: `৳${toBnDigits(price)}`  → ৳৪৯৯
```

### 4.5 English toggle strategy

- Bangla is **default**. The English toggle swaps the content locale and the **active body font** to **Inter Tight** for Latin-heavy English UI (Inter Tight is allowed here as a deliberate, requested Latin workhorse — tight, neutral, excellent at small sizes; Hind Siliguri's own Latin is fine but Inter Tight is crisper for all-English screens).
- Toggle persists per user (cookie) and is reflected in `<html lang>` and `dir` (both LTR; no RTL needed).
- **Do not** ship two full font families to every page. Bangla pages load only Hind Siliguri; the English face loads only when the user toggles to English (dynamic `next/font`), so the default Bangla experience stays light.
- Numerals follow locale: English UI → Latin digits everywhere.

---

## 5. Type Scale (applied)

| Token | Size | Weight | Leading | Use |
|---|---|---|---|---|
| display | `--text-4xl` | 700 | 1.45 | Marketing hero only |
| h1 | `--text-3xl` | 700 | 1.45 | Storefront hero, page title |
| h2 | `--text-2xl` | 700 | 1.45 | Section heading |
| h3 | `--text-xl` | 600 | 1.45 | Card/sub heading |
| price | `--text-lg`–`--text-2xl` | 700 | 1.1 | Product price (tnum) |
| body | `--text-base` | 400 | 1.7 | Bangla paragraph/body |
| body-strong | `--text-base` | 600 | 1.7 | Emphasis, labels |
| sm | `--text-sm` | 400/500 | 1.6 | Secondary, captions |
| xs | `--text-xs` | 500 | 1.5 | Badges, micro-labels |
| mono | `--text-sm` | 500 | 1.4 | IDs/SKUs/amounts (admin) |

---

## 6. Phase-0 Storefront Theme — "Doreja" (দরজা = doorway)

The one hardcoded theme. It sets the bar for every theme that follows. **Mobile-first**; design at 360px, scale up.

### 6.1 Section inventory

**1. Header (sticky)**
- Row 1 (trust strip, `--color-cod-weak` bg): tiny COD-green line — "ক্যাশ অন ডেলিভারি · সারা দেশে ডেলিভারি" with a phone link. This is a trust signal, above the fold, always. ~28px tall, `--text-xs`.
- Row 2 (main): logo (left, store name in Hind Siliguri 700), search icon, cart icon with count badge. Language toggle (বাং / EN) far right. Height 56px mobile / 64px desktop. Bottom hairline `--color-border`.
- Sticky on scroll; collapses Row 1 after 80px scroll (transform translateY, compositor-safe).

**2. Hero**
- Single focused banner: one strong image OR flat indigo panel with store tagline + one CTA ("কিনুন" / shop now). No carousel by default (carousels hurt LCP and 3G). Radius `--radius-xl`.
- Optional small trust chips below hero: "✓ ৭ দিনে রিটার্ন", "✓ ক্যাশ অন ডেলিভারি", "✓ অরিজিনাল প্রোডাক্ট". COD-green checks. These chips are the single biggest trust lever — keep them.
- Hero image: explicit width/height, AVIF/WebP, `fetchpriority="high"`, the only eager image on the page.

**3. Featured / Collections strip**
- Horizontal scroll row of category pills (`--radius-full`, `--color-surface` with border, active = primary). Below: a section heading + product grid.

**4. Product grid**
- **2 columns on mobile** (this is the BD norm and what buyers expect — 1-col feels empty/slow, 3-col is too cramped on 360px). 2 → 3 (sm) → 4 (lg) → 5 (xl).
- Gap `--space-3` mobile, `--space-4` up. Lazy-load below the fold.

**5. Product card** (see anatomy §6.3)

**6. Trust / value band**
- A full-width `--color-surface-2` band repeating the core promises with icons: COD, courier coverage (Steadfast/Pathao logos), return policy, hotline. Reassurance before footer.

**7. Footer**
- Store info, contact phone (Bangla digits, tappable `tel:`), social links (Facebook first — these sellers come from FB), policy pages, "Powered by Hybrid" (small, builds platform trust). bKash/Nagad/COD payment marks. Warm `--color-surface-2` bg, generous padding.

**8. Mobile sticky action bar (product page)**
- Fixed bottom bar: price (left) + big primary "অর্ডার করুন" button (right) + WhatsApp/Messenger fallback icon. `--z-sticky`. This is the conversion anchor for COD buyers and the Messenger-fallback crowd.

### 6.2 Mobile-first breakpoints

| BP | Width | Layout shifts |
|---|---|---|
| base | 320–374 | 2-col grid, single-column everything else, sticky bottom action bar, Row-1 trust strip on |
| sm | 375–767 | comfortable 2-col, larger tap targets, hero text up |
| md | 768–1023 | 3-col grid, header expands, sticky bottom bar → inline CTA, content max-width starts |
| lg | 1024–1439 | 4-col grid, max content width `1120px`, hover states active |
| xl | 1440+ | 5-col grid, max content width `1200px`, hero can go 2-up |

- **Content max-width:** storefront `1200px`, admin `1280px`, marketing `1120px` (tighter for reading), super-admin full-bleed with `1440px` table cap.
- **Tap targets:** minimum **44×44px** everywhere customer- or seller-facing. Non-negotiable on mobile.

### 6.3 Product card anatomy (the unit that sells)

```
┌─────────────────────────┐
│ [image 1:1, lazy]   ●SALE│  ← image: aspect-square, object-cover, radius-lg top
│                          │     SALE tag: accent (marigold) pill, top-right, only if discounted
│                          │
├─────────────────────────┤
│ Product name (Bangla)    │  ← --text-sm/base, weight 500, max 2 lines (line-clamp-2), ink
│ ৳৪৯৯  ৳৬৯৯               │  ← price: --text-lg weight 700 ink; strike old price --text-sm subtle
│ ✓ ক্যাশ অন ডেলিভারি      │  ← COD chip: --text-2xs, cod-green, only if COD enabled
│ [ কার্টে যোগ করুন ]      │  ← full-width secondary button (outline primary), 44px tall
└─────────────────────────┘
```

- **Card surface:** `--color-surface`, `border: 1px var(--color-border)`, `--radius-lg`, `--shadow-xs`. On hover (md+): `--shadow-md` + `translateY(-2px)` (compositor-safe). No hover on touch.
- **Price is the loudest element** after the image — buyers scan price first. Bangla digits, `tabular-nums`.
- **Out of stock:** image at 60% opacity + "স্টক নেই" overlay chip (danger-weak), button disabled.
- **Never** put more than: image · name · price · (old price) · COD chip · one action. Resist feature creep on the card; clutter reads as untrustworthy.

---

## 7. shadcn/ui Customization (so it does NOT look like a template)

shadcn ships a recognizable look (neutral gray, `--radius: 0.5rem`, thin borders, Inter). We override at the token + component level so Hybrid reads as a Bengali commerce brand, not a Vercel demo.

### 7.1 Global overrides (map shadcn vars → ours)
- Point shadcn's `--background`, `--foreground`, `--primary`, `--border`, `--ring`, `--radius`, `--muted`, `--accent`, `--destructive` at our tokens (§3). Set shadcn `--radius: 10px` (our `--radius-md`), not the default 8.
- Default font for all components = `var(--font-bangla)`. shadcn must never render in Inter by default.
- **Warm neutrals, not gray.** Our borders/surfaces are warm (`#E7E3DC`, `#FBFAF8`), not the cold `#E5E7EB` shadcn default. This single change kills the "template" feel instantly.

### 7.2 Buttons
- **Primary:** solid `--color-primary`, white text, `--radius-md`, weight 600, `--shadow-xs`. Hover → `--color-primary-hover` + `--shadow-sm`. Active → `--color-primary-active` + `translateY(1px)`. **No gradients.** Min height 44px on mobile.
- **Secondary:** `--color-surface` bg, `1px var(--color-border-strong)` border, ink text. Hover → `--color-surface-2`.
- **Accent (sale/CTA on marketing):** solid marigold `--color-accent`, ink text (not white — contrast). Use sparingly.
- **Ghost/link:** primary text, no bg; underline on hover for links.
- **Destructive:** `--color-danger`. Confirm dialog for irreversible (delete product, suspend tenant).
- Disabled: `--color-text-subtle` text on `--color-surface-2`, no shadow, `cursor: not-allowed`.

### 7.3 Surfaces & borders
- Cards: `--color-surface`, `1px var(--color-border)`, `--radius-lg`, `--shadow-xs`. Elevate to `--shadow-md` only on hover/active.
- **Hairline borders over heavy shadows** for structure — cheaper to paint (3G perf) and reads as crisp/printed.
- Inputs: `--radius-sm`, `1px var(--color-border-strong)` border, `--color-surface` bg, 44px height. Focus → border `--color-primary` + `--shadow-focus`. Bangla placeholder in `--color-text-subtle`.
- Modals/sheets: on mobile, dialogs become **bottom sheets** (slide up, `--radius-lg` top corners) — far better one-thumb ergonomics for mobile-only sellers and buyers. Desktop = centered dialog.

### 7.4 Focus states (accessibility + trust)
- **Always-visible focus ring** `--shadow-focus` (primary @ 35%, 3px). Never `outline: none` without a replacement. Keyboard and screen-reader users matter, and a visible focus ring signals "real, accessible software."
- Status uses **color + icon + text**, never color alone (color-blind safe; also survives cheap-screen color shift).

### 7.5 Tables (admin / super-admin)
- Zebra rows with `--color-surface-2`, hairline row dividers, sticky header. Numbers right-aligned, `--font-mono`, `tabular-nums`. Status as a colored chip (success/cod/warning/danger weak bg + matching text). Row tap → detail (mobile: card view, not a squished table — admin tables collapse to stacked cards below md).

---

## 8. Motion

**Approach: intentional, not decorative.** Motion clarifies state and flow; it never blocks the seller or burns 3G battery.

- **Allowed properties only:** `transform`, `opacity`, `clip-path`, `filter` (sparingly). Never animate `width/height/top/left/margin/padding/font-size`.
- **Durations:** taps/hovers `--dur-instant`; most transitions `--dur-fast`; sheets/dropdowns `--dur-base`; section/page entrance `--dur-slow` (rare).
- **Easings:** enter `--ease-out`, exit `--ease-in`, move `--ease-in-out`.
- **Patterns:** bottom-sheet slide-up (transform), toast fade+rise (opacity+transform), button press (translateY 1px), card hover lift (translateY -2px + shadow), skeleton shimmer on slow loads (opacity, GPU). Add-to-cart = quick scale pulse on the cart badge (transform), the one moment of delight.
- **Respect `prefers-reduced-motion`** (handled in §3.1). Storefront must remain fully functional with zero animation.

---

## 9. Anti-Slop Checklist (Hybrid-specific)

Before shipping any surface, verify:

- [ ] **Not dark by default.** Storefront/admin/marketing are light. (Dark reads low-trust for COD here.)
- [ ] **Bangla renders in Hind Siliguri, not a fallback** — check conjuncts (যুক্তাক্ষর), the mātrā bar, and that nothing falls back to Noto/system unintentionally.
- [ ] **Bangla body ≥ 16px, line-height ≥ 1.6, letter-spacing 0.** No tracked-out Bangla.
- [ ] **Storefront prices/phones in Bangla digits; admin IDs/amounts in Latin + tabular-nums.** Not mixed randomly.
- [ ] **COD / trust signals present and visible** (COD-green chip, hotline, courier marks). A storefront without visible trust cues is broken for this market.
- [ ] **No purple/violet gradient anywhere.** Accent is marigold, primary is indigo. No gradient CTAs.
- [ ] **Warm neutrals, not cold shadcn gray** (`#FBFAF8`/`#E7E3DC`, not `#FFFFFF`/`#E5E7EB`).
- [ ] **No default 3-col-icon-circle feature grid** on marketing. Use the trust-band / bento composition instead.
- [ ] **Product card has ≤ 6 elements**, price is the loudest after image. No card clutter.
- [ ] **Radius is consistent** (md=10 buttons, lg=14 cards). Pills used only for chips/badges, not everything.
- [ ] **Tap targets ≥ 44px** on every mobile control. Mobile dialogs are bottom sheets.
- [ ] **Visible focus ring everywhere.** No `outline:none` without replacement. Status = color + icon + text.
- [ ] **Hero is one image (or flat panel), not a carousel.** Only one eager image; everything else lazy.
- [ ] **Animations only on transform/opacity/clip-path/filter**, and `prefers-reduced-motion` honored.
- [ ] **Passes the screenshot test:** would a Bangladeshi buyer believe this is a real, established shop worth sending COD money to? If it looks empty, foreign, or fragile — fail.

---

## 10. Performance Guardrails (design's responsibility)

Design choices made specifically to hit storefront product/collection **< 1.5s on low-end Android / 3G**:

- Flat color + hairline borders instead of heavy imagery-as-chrome and large shadows.
- Self-hosted, subset, swapped fonts; preload only 2 weights; metric-matched fallback (CLS < 0.1).
- One eager hero image (AVIF/WebP, explicit dimensions, `fetchpriority=high`); everything else lazy.
- No carousels, no web-font icon packs (use inline SVG / a tiny subset), no decorative blobs/gradients to paint.
- Compositor-only motion. CSS for all simple transitions; no JS animation libs on the storefront critical path.
- CWV targets (carry from PRD): LCP < 2.5s, INP < 200ms, CLS < 0.1.

---

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-23 | Brand direction "Bazaar Modern", theme "Doreja" | Trust-first light system for COD-default BD buyers; warm neutrals + indigo trust + marigold warmth, distinct from bKash/Nagad rails and from generic shadcn |
| 2026-06-23 | Hind Siliguri primary Bangla, Noto Sans Bengali fallback | Built-for-UI, full conjunct coverage, market-familiar = legitimacy; metric-matched fallback for CLS |
| 2026-06-23 | Bangla numerals on storefront, Latin in admin | Buyers read prices/phones natively in Bangla; operators are faster/safer with Latin IDs and tabular alignment |
| 2026-06-23 | Light-only for Phase 0/1 (no dark default) | Dark mode reads as lower-trust for COD commerce in BD; revisit for admin later |
| 2026-06-23 | 2-col mobile product grid, sticky bottom action bar | BD storefront norm; 1-col reads empty, 3-col cramped at 360px; bottom bar anchors COD conversion |
