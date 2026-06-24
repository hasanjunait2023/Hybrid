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
| 2026-06-23 | Phase-1 status token set + state→color map | Order/payment/COD state machines need stable semantic colors reused everywhere (badges, steppers, dashboard); defined once, mapped from DB enums |
| 2026-06-23 | bKash-pink as single-purpose accent (`--color-bkash`) only on the bKash payment option | bKash brand-recognition raises trust on the payment step; confined so it never competes with indigo primary or reads as the Hybrid brand color |
| 2026-06-23 | Manual Order Entry = keyboard-first single-column "fast lane" form | F-commerce killer feature; sellers retype Messenger/phone orders all day — speed (Tab-through, phone-autofill of returning customers, Enter-to-add-line) is the whole value |
| 2026-06-23 | Admin nav = bottom tab bar on mobile, sidebar ≥ lg | Sellers are mobile-only and one-thumbed; bottom tabs match the device, sidebar only appears where there's room |

---

# Phase 1 Surfaces

> Extends the Bazaar Modern system (§0–§10) to every Phase-1 screen. **Reuses the existing tokens** — the only additions are the status color set, `--color-bkash`, and a few component-scoped spacings, all in §P0. Everything else (radius, shadow, type scale, Bangla rules, motion, the 44px tap-target floor, light-only) carries over unchanged. Where a surface is operator-facing (admin / super-admin) it follows the §4.4 numeral split: **Latin + tabular-nums**. Where it's buyer-facing (checkout, success, marketing) it's **Bangla numerals**.

## P0. New tokens (the only additions)

These are the genuinely-new tokens Phase 1 needs. Append to `:root` in §3.1 and map into Tailwind (§3.2). Nothing else in §3 changes.

```css
:root {
  /* ---- Phase-1: order / shipment lifecycle status colors ----
     One color per state. Each is rendered as a chip: weak bg + strong text + dot/icon.
     These intentionally reuse the semantic hues from §3.1 so the system stays small;
     new entries only where the lifecycle needs a distinct read. */

  /* pending / awaiting action — warning family (§3.1) */
  --color-st-pending:        #B45309;  /* = --color-warning */
  --color-st-pending-weak:   #FBEEDC;

  /* confirmed — indigo: acknowledged, "official", in the system */
  --color-st-confirmed:      #1D4ED8;  /* = --color-primary */
  --color-st-confirmed-weak: #EFF4FF;

  /* packed — marigold: physical prep, "in the shop" warmth, distinct from confirmed */
  --color-st-packed:         #B7791F;  /* darker marigold for text contrast on weak */
  --color-st-packed-weak:    #FEF3C7;

  /* shipped / in-transit — teal-cyan: "on the road", NEW hue (no existing token reads as motion) */
  --color-st-shipped:        #0E7490;  /* cyan-700 */
  --color-st-shipped-weak:   #E0F2F7;

  /* delivered / paid / success — success family (§3.1) */
  --color-st-delivered:      #15803D;  /* = --color-success */
  --color-st-delivered-weak: #E7F4EC;

  /* returned — amber-brown: completed-but-reversed, distinct from cancelled red */
  --color-st-returned:       #92400E;  /* amber-800 */
  --color-st-returned-weak:  #FBEEDC;

  /* cancelled / failed — danger family (§3.1) */
  --color-st-cancelled:      #B91C1C;  /* = --color-danger */
  --color-st-cancelled-weak: #FBE9E9;

  /* ---- Phase-1: payment-method accent — bKash brand pink ----
     SINGLE PURPOSE. Only the bKash payment option / bKash payment-status chip.
     NEVER a CTA color, never the Hybrid brand, never on marketing. */
  --color-bkash:        #E2136E;  /* bKash brand magenta */
  --color-bkash-weak:   #FCE7F0;
  --color-bkash-text:   #A30E51;  /* darker for AA text on weak bg */

  /* ---- Phase-1: dashboard / data-dense rhythm ----
     Admin runs tighter than storefront. These give a compact scale without
     touching the storefront's comfortable spacing. */
  --space-cell-y:  0.5rem;    /* 8 — table cell vertical pad (compact) */
  --space-cell-x:  0.75rem;   /* 12 — table cell horizontal pad */
  --metric-gap:    0.75rem;   /* gap between dashboard metric cards on mobile */
}
```

```ts
// tailwind.config.ts → theme.extend.colors (add to existing block, do not replace)
st: {
  pending:   { DEFAULT: "var(--color-st-pending)",   weak: "var(--color-st-pending-weak)" },
  confirmed: { DEFAULT: "var(--color-st-confirmed)", weak: "var(--color-st-confirmed-weak)" },
  packed:    { DEFAULT: "var(--color-st-packed)",    weak: "var(--color-st-packed-weak)" },
  shipped:   { DEFAULT: "var(--color-st-shipped)",   weak: "var(--color-st-shipped-weak)" },
  delivered: { DEFAULT: "var(--color-st-delivered)", weak: "var(--color-st-delivered-weak)" },
  returned:  { DEFAULT: "var(--color-st-returned)",  weak: "var(--color-st-returned-weak)" },
  cancelled: { DEFAULT: "var(--color-st-cancelled)", weak: "var(--color-st-cancelled-weak)" },
},
bkash: { DEFAULT: "var(--color-bkash)", weak: "var(--color-bkash-weak)", text: "var(--color-bkash-text)" },
```

### P0.1 Status → color map (DB enum → token) — the single source

Three independent DB fields drive three independent chips. **Never collapse them into one badge** — a seller needs to see "delivered but COD not yet collected" at a glance. Render each as: `weak` bg + `DEFAULT`-colored text + leading 8px dot (or icon) + Bangla/English label. Always color **+ icon + text** (§7.4), never color alone.

**`order_fulfillment_status`** (the lifecycle stepper drives off this):

| enum | token | label (বাং / EN) | icon |
|---|---|---|---|
| `pending` | `st-pending` | অপেক্ষমাণ / Pending | clock |
| `confirmed` | `st-confirmed` | নিশ্চিত / Confirmed | check |
| `packed` | `st-packed` | প্যাকড / Packed | box |
| `shipped` / `in_transit` | `st-shipped` | পাঠানো হয়েছে / Shipped | truck |
| `delivered` | `st-delivered` | ডেলিভার্ড / Delivered | check-circle |
| `returned` | `st-returned` | ফেরত / Returned | undo |
| `cancelled` | `st-cancelled` | বাতিল / Cancelled | x-circle |

**`payment_status`**:

| enum | token | label | note |
|---|---|---|---|
| `unpaid` | `st-pending` | বকেয়া / Unpaid | COD default until collected |
| `pending` | `st-pending` | প্রসেসিং / Processing | bKash create→execute window |
| `paid` | `st-delivered` (success) | পরিশোধিত / Paid | |
| `failed` | `st-cancelled` | ব্যর্থ / Failed | bKash execute failed |
| `refunded` | `st-returned` | রিফান্ড / Refunded | |

**`cod_status`** (COD-specific; uses the dedicated COD-green from §3.1 for the "this is cash-safe" read):

| enum | token | label |
|---|---|---|
| `not_applicable` | (no chip) | — (prepaid order) |
| `pending` | `st-pending` | সংগ্রহ বাকি / To collect |
| `collected` | `cod` (`--color-cod`) | সংগৃহীত / Collected |
| `remitted` | `cod` | জমা হয়েছে / Remitted |
| `discrepancy` | `st-cancelled` | গরমিল / Mismatch |

**Payment-method chip** (which rail): COD → `cod` green pill "ক্যাশ অন ডেলিভারি"; bKash → `bkash` pink pill with the bKash glyph. This is the **only** place pink appears in admin.

Reusable component: `<StatusBadge kind="fulfillment|payment|cod|method" value={enum} />` — one component, reads the map above. Build it once; every list, detail, dashboard, and stepper consumes it.

---

## P1. Mobile checkout flow (HIGHEST PRIORITY)

Buyer-facing, Bengali-first, Bangla numerals, must complete on a low-end Android over 3G. Design at **360px**. This is where COD trust is won or lost — it inherits the storefront trust treatment, not a generic checkout.

### P1.1 Page shell
- Single column, `--color-bg` (warm paper). Max content width `480px`, centered ≥ sm.
- **Top:** slim sticky header — back chevron + "চেকআউট" title + a small COD-green trust line under it: "🔒 নিরাপদ অর্ডার · ক্যাশ অন ডেলিভারি". Reuse the §6.1 Row-1 trust strip treatment (`--color-cod-weak` bg). Trust must be visible on the money screen.
- **No** logins, no account creation, no coupon-hunting above the fold. Friction kills COD conversion.

### P1.2 Field order (deliberate — phone first, minimum fields)
The whole form is **one scroll, one column**, big inputs (44px+), Bangla labels above each field (never placeholder-only — placeholders vanish and hurt low-literacy users):

1. **ফোন নম্বর** (phone) — `inputmode="tel"`, `type="tel"`, autofocus. **First field on purpose:** it's the COD identity key (customer upsert by `(tenant, phone)` per research §4) and the seller's lifeline. On blur, if a returning customer matches, soft-fill name/address (with a "আপনার আগের তথ্য" chip they can edit). Accepts Bangla or Latin digits, normalizes to Latin (§4.4).
2. **নাম** (full name) — `autocomplete="name"`.
3. **ঠিকানা — বিভাগ → জেলা → থানা** (cascading, see P1.3).
4. **বিস্তারিত ঠিকানা** (street/house/area) — textarea, 2 rows.
5. **পেমেন্ট মাধ্যম** (payment method, see P1.4) — COD default.
6. (optional) **নোট** — collapsed "✎ অর্ডার নোট যোগ করুন" link that expands; not shown by default.

That's **5 required inputs**. Anything more must justify itself. No email (BD buyers don't reliably have/check it; phone is the channel).

### P1.3 Division → District → Thana cascading selects
- Powered by `bangladesh-location-data` (research §5): `divisions_bn`, `districts_bn[divisionValue]`, `upazilas_bn[districtValue]`. **Render Bangla option text and Bangla labels**; store the canonical value to `customer_address.division/district/thana`.
- **Mobile pattern:** each select is a **bottom sheet** (§7.3), not a native `<select>` dropdown — a searchable sheet with a Bangla filter input at top (64 districts is too many to scroll blind). Trigger looks like an input: label above, chosen value + chevron inside, 44px tall.
- **Cascade rules:** District disabled until Division chosen; Thana disabled until District chosen. Changing a parent clears children. Disabled state uses `--color-text-subtle` on `--color-surface-2` (§7.2). Each sheet shows a count ("৬৪টি জেলা") and supports type-to-filter (filter matches Bangla and Latin transliteration).
- Selecting a Thana may surface a delivery-fee line in the summary (Inside Dhaka vs Outside, the universal BD split) — show it the instant thana resolves so the buyer sees the real total before committing.

### P1.4 Payment method — COD is the loudest, bKash is the alternative
Two large radio-cards stacked, full width, each 64px+ tall, `--radius-lg`. Selected = 2px ring in the option's accent + weak bg; unselected = `--color-surface` + `--color-border`.

- **COD (DEFAULT, selected, listed first, visually loudest):**
  - Border/ring `--color-cod`, bg `--color-cod-weak` when selected. Big COD-green check icon, title **"ক্যাশ অন ডেলিভারি"** (`body-strong`), subtitle "পণ্য হাতে পেয়ে টাকা দিন" (pay-on-receipt — the trust promise spelled out).
  - A small COD-green reassurance line under it: "✓ অগ্রিম টাকা লাগবে না". This sentence is the conversion lever for first-time COD buyers — keep it.
- **bKash (alternative, second):**
  - This is the **only** place `--color-bkash` pink appears in the buyer flow. Selected ring/accent = `--color-bkash`, bg `--color-bkash-weak`, bKash logo glyph, title "বিকাশ", subtitle "এখনই পেমেন্ট করুন". 
  - On select + confirm, opens the **tokenized bKash popup/iframe** (research §1) — do not build a custom card form. While the popup is open, the sticky bar shows a "বিকাশ পেমেন্ট চলছে…" pending state (spinner on `transform`).
- The bKash pink **never** bleeds onto the Confirm button — the Confirm bar stays indigo primary regardless of method. Pink is the rail, indigo is the action.

### P1.5 Order summary
- A `--color-surface` card, `--radius-lg`, hairline border, above the sticky bar. Each line: item thumbnail (40px) + name (line-clamp-1) + qty ×, price right-aligned (Bangla digits, `tnum`).
- Totals block: সাবটোটাল, ডেলিভারি চার্জ (resolves from thana), and **সর্বমোট** in `price` scale (`--text-2xl`, weight 700, ink) — the grand total is the second-loudest thing on the page after the Confirm button.
- Editable qty steppers (− / value / +), 44px targets. Remove = trash icon with undo toast.

### P1.6 The sticky Confirm bar
- Reuses §6.1 #8 / §6.3 sticky-bar pattern. Fixed bottom, `--z-sticky`, `--color-surface` with top hairline + `--shadow-lg` (lifts off content).
- **Left:** "সর্বমোট" micro-label + grand total (Bangla digits, `tnum`, `--text-lg` weight 700).
- **Right (fills remaining width):** primary button, indigo, 52px tall, weight 600 — **"অর্ডার করুন"** for COD, or **"বিকাশে পেমেন্ট করুন"** when bKash is selected (label reflects the action). One primary action, always.
- Disabled (incomplete required fields) → §7.2 disabled style; on tap of a disabled bar, scroll to + shake (transform) the first invalid field.
- Submit shows inline button spinner; never a full-page blocker (3G — keep the page interactive).

### P1.7 Order success / track page
- Buyer-facing celebration + reassurance, Bengala numerals throughout.
- **Hero confirmation:** big COD-green check (the one moment of delight, scale-in on `transform`, §8), "অর্ডার কনফার্ম হয়েছে!" (`h1`), order number in `--font-mono`-ish prominent line "অর্ডার #ABC123" (order numbers stay Latin/alphanumeric even buyer-side — they're IDs the buyer reads back to the seller on the phone).
- **What happens next** card: 1) "আমরা আপনাকে কল করে কনফার্ম করব" 2) "৳ টাকা ডেলিভারিতে দিন" (for COD) 3) courier + ETA when shipped. Sets expectations = fewer "where's my order" calls.
- **Live status stepper** (the same P3.2 stepper, read-only horizontal) showing current `order_fulfillment_status`. Updates as the courier syncs (research §2).
- **Track later:** "ফোন নম্বর দিয়ে অর্ডার খুঁজুন" — phone-based lookup, no account needed.
- Prominent **store contact** (tappable `tel:` + Messenger/WhatsApp) — the COD buyer's safety net.

---

## P2. Admin shell + dashboard

Operator-facing → **Latin numerals, `tabular-nums`, `--font-mono` for amounts/IDs** (§4.4). Calm and compact (§2 differentiation rule): marigold nearly absent, indigo only for the single primary action, status colors carry the meaning.

### P2.1 Shell / navigation (mobile-only sellers — this is the default device)
- **Mobile (base–md): bottom tab bar**, `--z-sticky`, `--color-surface` + top hairline, 5 tabs max, each 44px+, icon + tiny Bangla label: **হোম** (dashboard) · **অর্ডার** · **পণ্য** · **গ্রাহক** · **আরও** (sheet: customers-overflow, settings, marketing, switch store, logout). Active tab = indigo icon + label + 2px top indicator. This matches the one-thumb reality better than a hamburger.
- **Desktop (≥ lg): fixed left sidebar** (`240px`, `--color-surface`, hairline right). Same items as a vertical list, active = `--color-primary-weak` row + indigo text + left indicator bar. Collapses to icon-rail at lg, full at xl.
- **Top bar (all sizes):** store switcher (left), page title (center on mobile), and a single context action (right) — e.g. "+ নতুন অর্ডার" on the orders screen. One primary action per screen (§2).
- Content max-width `1280px` (§6.2).

### P2.2 Store switcher
- A `--color-surface` button in the top bar: store avatar (initial in indigo-weak circle) + store name + chevron. Opens a sheet (mobile) / dropdown (desktop) listing the seller's stores with avatars + a "+ নতুন স্টোর" row. Current store = check + `--color-primary-weak`. Sellers with one store still see it (sets the multi-store mental model early).

### P2.3 Dashboard — data-dense but calm
Vertical scroll, mobile-first. Hierarchy top→bottom = **what needs action** before **vanity metrics**.

1. **Greeting + date** — "সুপ্রভাত, রেশমি" + today's date. Light, sets context.
2. **Metric cards** — a 2-col grid on mobile (`--metric-gap`), 4-col ≥ md. Each card: `--color-surface`, `--radius-lg`, hairline, `--shadow-xs`. Tiny muted Bangla label on top, **big Latin number** (`--text-2xl`/`3xl`, weight 700, `tabular-nums`) below, a small delta or sub-line under that. Order by operational urgency:
   - **আজকের অর্ডার** (today's orders) — count; sub-line "vs গতকাল +N".
   - **আজকের বিক্রি** (today's revenue) — `৳` + amount, `--font-mono` tabular.
   - **COD বকেয়া** (COD pending) — amount in **`st-pending`** color (this is money owed to the seller; make it pop, not alarming). Tappable → filtered orders.
   - **কম স্টক** (low stock) — count in **`warning`**; tappable → filtered products. 0 = muted/calm, not green-celebrated.
   - These four are the seller's morning glance. Keep it to four; resist a metric wall.
3. **Action needed strip** (only if non-zero): a single `--color-warning-weak` banner — "৩টি অর্ডার কনফার্ম করা বাকি →". The one nudge.
4. **Recent orders** — compact list (not a wide table on mobile): each row = order # (mono) · customer name · time-ago · grand total (right, mono tnum) · `<StatusBadge kind="fulfillment">`. Tap → order detail. "সব অর্ডার দেখুন →" footer link.
- **Calm rule:** no charts on the Phase-1 dashboard unless they earn it; a sparkline on revenue is the maximum. Numbers + status chips do the work. No marigold here.

---

## P3. Orders

Operator-facing (Latin numerals, mono amounts). The orders area is where the F-commerce seller lives — optimize for **triage speed** and **manual entry speed**.

### P3.1 Orders list + status filters
- **Filter row** (sticky under top bar): horizontal-scroll pills (`--radius-full`, §6.3 chip style) — সব · অপেক্ষমাণ · নিশ্চিত · প্যাকড · পাঠানো · ডেলিভার্ড · ফেরত/বাতিল. Active pill = `--color-primary` solid; each pill shows a count badge. A secondary "COD বকেয়া" / "পেমেন্ট ব্যর্থ" filter set for money triage.
- **Search:** by phone or order # (phone first — sellers search by the number the buyer gives on the call).
- **Rows (mobile = stacked cards, not a squished table, §7.5):** order # (mono) + time-ago top-right · customer name + phone · grand total (mono, prominent) · three chips in a row: `fulfillment` · `payment` · `cod`. Left edge: a 3px color bar in the fulfillment status color for scan-ability down the list.
- **Desktop ≥ md:** real table — zebra (§7.5), columns: ☐ · Order# · Customer · Phone · Total (right, mono tnum) · Fulfillment · Payment · COD · Date · ⋯. Sticky header. Bulk-select → bulk actions (confirm, "Steadfast-এ পাঠান", print).
- **Per-row / bulk primary action is contextual to status:** pending→"নিশ্চিত করুন", confirmed→"প্যাক করুন", packed→"কুরিয়ারে পাঠান" (creates Steadfast consignment, research §2). The list *is* the pipeline control surface.

### P3.2 Status pipeline stepper (the visual spine, reused on order-detail and buyer success page)
- Horizontal stepper: **pending → confirmed → packed → shipped → delivered**, with **returned / cancelled** as a terminal off-ramp shown in red only when active.
- Each node: a dot/icon + Bangla label under it; connector line between. Completed steps = filled in that step's status color, current = filled + ring (`--shadow-focus`-style halo in the step color), upcoming = `--color-border` outline + `--color-text-subtle` label.
- On a **returned/cancelled** order, the line after the last reached step turns `st-cancelled`/`st-returned` and the off-ramp node replaces "delivered". Color + icon + label (§7.4) so it's unmistakable.
- Mobile: if it overflows 360px, it becomes a **vertical** stepper (nodes stacked, connectors vertical) — never shrink labels below 12.5px.
- This is a presentational component fed by `order_fulfillment_status`; one stepper, three placements (order-detail header, buyer success page, optionally dashboard recent-order hover).

### P3.3 Order detail
- **Header:** order # (mono, big) + the P3.2 stepper + the contextual primary action button (status-driven, as P3.1). Created-at, channel (storefront / "ম্যানুয়াল").
- **Two-column ≥ lg, stacked on mobile:**
  - **Left/main:** line items (thumbnail · name · variant · qty · unit price · line total, all mono tnum) → totals block (subtotal, delivery, **grand total** emphasized) → payment block (method chip, `payment_status`, `cod_status`, trxID mono if bKash) → courier block (consignment ID, tracking code, live status, "ট্র্যাক করুন" link once shipped).
  - **Right/aside:** customer card (name, phone with `tel:` + Messenger/WhatsApp tap, "৩টি আগের অর্ডার" link to customer detail), shipping address (the resolved division/district/thana + detail), order notes/timeline (status-change audit log, newest first).
- **Actions:** print invoice / packing slip (P3.5), edit (pre-ship only), cancel (destructive confirm, §7.2), resend SMS.

### P3.4 Manual Order Entry — the F-commerce killer feature (design for SPEED)
The seller is retyping an order spoken over a phone call or pasted from Messenger. Every saved second × hundreds of orders/month = the product's value. **Keyboard-first, single column, no wizard, no step pages.**

- **Entry point:** "+ নতুন অর্ডার" is the orders-screen primary action; also a global FAB on mobile. Opens **full-screen on mobile, wide centered sheet on desktop** — not a cramped modal.
- **Layout (top→bottom, all Tab-reachable in order):**
  1. **ফোন নম্বর** — first field, autofocus. On entry of a known number → **instant inline fill** of name + last address (a dismissible "আগের গ্রাহক — রেশমি, মিরপুর" chip). This single behavior removes most typing for repeat buyers; it's the heart of the feature.
  2. **নাম** (auto-filled if returning).
  3. **পণ্য যোগ করুন** — a **type-ahead product search** (by name or SKU). Selecting adds a line; if the product has variants, an inline compact variant picker (size/color chips) appears in the line. **Enter adds the line and refocuses the search** so the seller can rattle off "3 items" without touching the mouse. Each line: name · variant · qty stepper (or type a number) · auto price (editable for haggled/manual price) · line total · ✕.
  4. **ঠিকানা** — same Division→District→Thana cascade as checkout (P1.3), but operator-tuned: type-to-filter is keyboard-default (the sheet opens with the filter focused), and the field accepts paste of a full address blob with a "ঠিকানা আলাদা করুন" parse helper for Messenger copy-paste.
  5. **পেমেন্ট** — COD default radio (compact inline, not the big buyer cards); bKash/"পরিশোধিত"/"বকেয়া" quick toggle. Manual orders are usually COD-confirmed-on-call, so COD-confirmed is the one-tap default.
  6. **ডেলিভারি চার্জ** — auto from thana, editable.
- **Persistent summary + sticky save bar** (bottom): running grand total (mono) + **"অর্ডার তৈরি করুন"** primary, and a **"তৈরি করে আরেকটি"** secondary (save + reset + refocus phone) — sellers process orders in batches; this keeps them in flow.
- **Speed affordances:** full Tab order, `Enter` = add product line, `Ctrl/Cmd+Enter` = save order, numeric `inputmode` on qty/price, no required field beyond phone + ≥1 line + address, optimistic save with toast + undo. **No animations that delay input.** This screen is judged in milliseconds.

### P3.5 Printable invoice / packing slip
- A print-only layout (`@media print`), A4 + 80mm thermal-friendly variant. **Black ink on white, no warm-paper bg, no shadows** (printer reality). Latin numerals, mono for IDs/amounts (alignment).
- **Invoice:** store header (name, logo, phone, address) · "ইনভয়েস" + order # + date · bill-to (customer, phone, full resolved address) · line-item table (item/variant/qty/price/total) · totals · payment method + COD-amount-due loud ("ডেলিভারিতে সংগ্রহ: ৳N") · thank-you + return policy line.
- **Packing slip / courier label:** big recipient block (name, phone, address — the courier reads this), **COD amount very large** (the single most error-prone field — make it unmissable), order # + Steadfast tracking code (mono + optional barcode/QR of tracking_code), item checklist with checkboxes for the packer. Optimize the label so a thumb-typing seller can print, peel, stick.
- Bangla for human-readable address/name (the courier reads Bangla); IDs/amounts Latin.

---

## P4. Products / variants admin

Operator-facing. Product form is the second-most-used admin screen; make variant entry not painful.

- **List:** thumbnail · name · status chip (active=`success`, draft=`st-pending`, archived=muted) · price (mono) · total inventory (mono, `warning` if low, `danger` if 0) · ⋯. Mobile = stacked cards with thumbnail-left. Search + status filter pills (§P3.1 pattern).
- **Product form (single column ≤ md, main+aside ≥ lg):**
  - **Main:** নাম · বিবরণ (rich-ish but simple) · **ছবি** (upload + reorder) · **দাম** · **ভ্যারিয়েন্ট** (matrix).
  - **Aside ≥ lg:** স্ট্যাটাস (active/draft/archived select), কালেকশন, organization. On mobile these sit below as labeled sections.
- **Image upload + reorder:** drag-grid of square thumbs (`--radius-md`), first image = "কভার" badge (marigold — allowed accent, it's a highlight). Drag to reorder (pointer + a long-press handle for touch); each thumb has a remove ✕ and "কভার করুন" on hover/long-press. Upload tile (dashed `--color-border-strong`, "+ ছবি যোগ করুন") with progress on the tile, not a blocking modal. Lazy-thumbnail, client-resize before upload (3G upload budget).
- **Variant matrix (the painful part — make it fast):**
  - Define **options** first: option name (e.g. সাইজ) + value chips (S, M, L, …), add a second option (রং) the same way. The grid is the cartesian product.
  - **Table:** one row per combination — variant label (S / লাল) · **দাম** · **স্টক** · **SKU** (mono) · image-link · active toggle. All numeric cells are `inputmode`-numeric, mono, `tabular-nums`, **Tab/Enter to move down a column** (bulk price/stock entry without the mouse — same speed ethos as P3.4).
  - **Bulk helpers above the grid:** "সব দামে প্রয়োগ করুন ৳___", "সব স্টকে ___", auto-generate SKU pattern. Sellers commonly price all variants the same; one-click fill saves dozens of taps.
  - Mobile: matrix collapses to a stacked list, one card per variant (label header + price/stock/SKU fields). Never a horizontally-scrolling table the seller has to swipe — too error-prone for inventory.
- **Collections:** simple — name, optional image, product multi-select (search + checklist). Manual + (later) rule-based; Phase 1 manual is fine.

---

## P5. Customers

Operator-facing. The seller's relationship memory — repeat COD buyers are the business.

- **List:** name · phone (mono, tappable) · orders count · total spent (mono `৳`) · last-order time-ago · tags. Search by name/phone. Sort by spend / recency. Mobile = stacked cards.
- **Detail:**
  - **Header:** name, phone (`tel:` + Messenger/WhatsApp), avatar (initial), and **trust signals at a glance**: total orders, total spent, **COD reliability** (delivered vs returned ratio — a quiet but critical signal; a high return rate flags a risky COD buyer). Show returned-rate as a small `warning`/`danger` chip when notable — this is real F-commerce money protection.
  - **Order history:** the P3.1 row pattern, scoped to this customer, with the status chips.
  - **Addresses:** saved division/district/thana + detail cards; default marked; reused to pre-fill manual orders (ties back to P3.4).
  - **Notes / tags:** free-text notes (newest first) + tag chips (e.g. "ভালো গ্রাহক", "ফেরত দেয়", "হোলসেল"). Tags are filterable in the list. Tags use neutral `--color-surface-2` chips except semantic ones (risk tag = `danger-weak`).

---

## P6. Settings

Operator-facing. Grouped, calm, one section per concern. Mobile = a list of section rows → detail; desktop = left settings-nav + right panel.

- **পেমেন্ট:**
  - **COD** — enable toggle (on by default — it's the market default), inside/outside-Dhaka delivery-charge fields (mono, ৳). 
  - **বিকাশ** — enable toggle; when on, fields for app_key / app_secret / username / password (masked, `--font-mono`) + a **"সংযোগ পরীক্ষা করুন"** test button (grant-token smoke test, research §1). The bKash row header is the **only** admin place `--color-bkash` pink appears (a small bKash glyph), echoing the buyer flow. Sandbox/production mode switch with a clear `warning` chip when in sandbox.
- **কুরিয়ার (Steadfast):** enable toggle, Api-Key / Secret-Key (masked mono), "ব্যালেন্স দেখুন" button (`get_balance`, research §2), default delivery-charge mapping. A `warning` note that live courier needs a real merchant account (no sandbox) — honest, sets expectations.
- **স্টোর প্রোফাইল:** store name, logo, hotline phone, address, social links (Facebook first), subdomain (shown, mono) + custom-domain attach (Phase-1 may stub the SSL step — show status chip). Default language, BDT formatting preview.
- **Pattern:** each settings section is a `--color-surface` card, hairline, with a clear sticky "সেভ করুন" only when dirty (disabled until changed). Secrets are write-masked (show last 4). Destructive (disable bKash mid-flow, delete store) = confirm dialog.

---

## P7. Super-admin (platform owner — Junait)

Per §2: **utilitarian, data-dense, compact**. Latin numerals, `--font-mono` for IDs, status colors do the talking, marigold absent. This is a power-user tool — denser than tenant admin is correct.

- **Layout:** fixed sidebar (Tenants · Billing · Plans · System), full-bleed content with `1440px` table cap (§6.2). No bottom-tab mobile treatment needed — owner tool, desktop-assumed, but stays responsive (cards < md as a fallback).
- **Tenant directory table (the core screen):** dense zebra table (`--space-cell-y`/`-x`), sticky header, columns:
  - ☐ · **Tenant** (store name + subdomain, subdomain in mono muted) · **Owner** (name/phone) · **Plan** (chip: trial/starter/growth/pro) · **Status** (`active`=`success`, `trialing`=`st-confirmed`/info, `past_due`=`warning`, `suspended`=`danger` — color+text) · **MRR ৳** (mono tnum, right) · **Orders 30d** (mono) · **Created** · **⋯**.
  - Filters: status, plan, search by store/owner/phone. Sort any numeric column.
- **Row actions (⋯):** view tenant, impersonate (audit-logged), suspend/reactivate (destructive confirm), change plan, extend trial. Suspend uses `danger` and a typed-confirm for safety.
- **Tenant detail:** identity + owner + plan/subscription state + usage (orders, products, storage vs plan caps with `warning` when near cap) + billing history (manual bKash records per research §1) + audit log. Utilitarian stacked cards, mono everywhere it's an ID or amount.
- **Status badges everywhere** use the §P0.1 map; subscription states map: `trialing`→st-confirmed, `active`→success, `past_due`→warning, `suspended`/`cancelled`→danger.

---

## P8. Marketing site + signup

Buyer-of-the-product facing (the *seller* is the customer here). Per §2 Marketing surface: **persuasive, confident, Bengali, spacious, full palette + marigold for energy**, BDT pricing, social proof. This is the showroom — it gets the air and warmth the admin doesn't.

### P8.1 Landing (Bengali, conversion-focused)
- **Hero:** big Bangla headline (`display`/`--text-4xl`, 700) — the value prop in plain seller language: "১০ মিনিটে নিজের অনলাইন দোকান — বাংলায়, বিকাশে, ক্যাশ অন ডেলিভারিতে।" Sub-line, then **two CTAs**: primary indigo "ফ্রি শুরু করুন" + secondary "ডেমো দেখুন". A real product screenshot (the storefront) beside/under it — show, don't tell. Spacious, `--space-section` rhythm.
- **Trust band** (not a generic 3-icon feature grid — §9 bans that): the differentiators as a bento/editorial composition — "ক্যাশ অন ডেলিভারি + কুরিয়ার মিলিয়ে দেখুন", "বাংলায় পুরো দোকান", "বিকাশে পেমেন্ট", "Messenger-এর অর্ডার আর হারাবে না". Marigold accents allowed for energy.
- **How it works:** 3 steps (সাইন আপ → পণ্য যোগ করুন → শেয়ার করুন), illustrated with real UI, not stock icons.
- **Social proof:** seller testimonials/logos, "X+ দোকান চলছে" counter (Bangla digits — buyer-facing). F-commerce sellers trust peers.
- **Pricing:** the PRD tiers as cards in **৳ / BDT, Bangla numerals** — ফ্রি (১৪ দিন) · স্টার্টার ৳৪৯৯ · গ্রোথ ৳১,৯৯৯ · প্রো ৳৪,৯৯৯+. Recommended tier (স্টার্টার) gets a marigold "জনপ্রিয়" ribbon + indigo emphasis. Monthly/yearly toggle. Each card: price (loud), what's included (checklist), CTA. "বিকাশে পেমেন্ট" noted (removes the card-payment barrier — a real differentiator).
- **FAQ + final CTA band** (indigo panel, single "ফ্রি শুরু করুন"). Footer: contact, Facebook-first socials, policies, "Powered by Hybrid" reinforcement.
- Performance: marketing still respects §10 — one eager hero asset, lazy below, no carousels.

### P8.2 Signup → store-name → provisioning flow
A short, confidence-building wizard. Bengali, big inputs, trust copy at each step.

1. **সাইন আপ:** phone + email (both, phone matters in BD per research §3) + password, or OTP. One screen, minimal. Trust line: "ক্রেডিট কার্ড লাগবে না · ১৪ দিন ফ্রি".
2. **দোকানের নাম:** store name input → **live subdomain preview** ("`reshmis-shop`.hybrid.com.bd" updating as they type, mono, with availability check ✓/✕). This is the magic moment — show the real URL forming. Validates/normalizes to a slug.
3. **প্রোভিশনিং:** a brief, honest progress screen (research §3: tenant + domain + owner-member + 14-day trial subscription created via the provisioning Server Action) — "আপনার দোকান তৈরি হচ্ছে…" with real sub-steps ticking (✓ দোকান তৈরি · ✓ ঠিকানা সেট · ✓ ট্রায়াল চালু). Compositor-safe spinner/check animations (§8). Then a celebratory hand-off → straight into the admin dashboard (P2.3) with a "প্রথম পণ্য যোগ করুন" nudge (activation KPI: live store + ≥1 product in 24h).
- **Anti-slop:** this flow is the first impression of product quality — Hind Siliguri, warm neutrals, indigo, real progress (not a fake spinner), zero foreign-template feel. It must feel like the §9 screenshot test: "this is real, local, and I can trust it with my business."

---

## P9. Phase-1 anti-slop / consistency additions

On top of §9, every Phase-1 surface must also pass:

- [ ] **Numeral split honored per surface:** buyer (checkout, success, marketing) = Bangla digits; operator (admin, super-admin, invoices) = Latin + `tabular-nums`. Never mixed within a surface.
- [ ] **Status = the §P0.1 map, via `<StatusBadge>`** — never an ad-hoc color. The three lifecycle fields render as three independent chips, never collapsed.
- [ ] **bKash pink (`--color-bkash`) appears ONLY** on: the buyer bKash payment option, the admin payment-method chip, and the settings bKash row. Never a CTA, never the brand, never on marketing.
- [ ] **COD is the loudest payment option** on checkout, with the COD-green trust treatment + "অগ্রিম টাকা লাগবে না" reassurance. The Confirm action stays indigo regardless of method.
- [ ] **One primary action per admin screen** (§2); the action is **status-contextual** on orders.
- [ ] **Manual order entry is keyboard-first** (Tab order, Enter-adds-line, returning-customer autofill, "create & another"). It is judged in milliseconds — no input-delaying motion.
- [ ] **Admin tables collapse to stacked cards < md** (§7.5); variant matrix and invoices never force horizontal swiping for data entry.
- [ ] **Stepper uses color + icon + label** for every state, with a clear returned/cancelled off-ramp.
- [ ] **Mobile admin nav = bottom tabs**, every control ≥ 44px, dialogs = bottom sheets (§7.3).
- [ ] **Print layouts are black-on-white**, COD amount unmissable, tracking code mono/scannable.
- [ ] **Provisioning shows real progress**, lands the seller on "add first product" (activation KPI).

---

# Phase 2 Surfaces (M3)

> Extends Bazaar Modern (§0–§10) and the Phase-1 surfaces (§P0–§P9) to the seven Phase-2 (M3)
> surfaces: visual customizer, theme catalog, COD & settlements, per-provider settings, custom-domain
> connect, discounts, and own-auth. **Zero new color/type/radius/motion tokens are required** — every
> surface composes from §3 (+ §P0). The only genuinely-new primitives are a small set of **shared
> components** (§Q0), justified below. Everything else (warm neutrals, indigo primary, 44px floor,
> light-only, Bangla-body ≥16px/1.7, the numeral split, bottom-sheet dialogs, status-via-`<StatusBadge>`)
> carries over unchanged. Surface numerals follow §4.4: **operator-facing admin = Latin + `tabular-nums`;
> buyer-facing (auth, storefront preview content) = Bangla digits.**

## Q0. New shared components (build once, reuse everywhere)

These earn their keep by appearing on 3+ Phase-2 surfaces. Anything used once stays a one-off inside its
page — do **not** abstract single-use markup. Each new component is light, presentational, and lives in
`packages/ui/src/components/` so admin and (where noted) storefront share it.

| Component | Why it's shared (not a one-off) | Used by |
|---|---|---|
| **`<ProviderCard>`** | The single integration-config pattern: header row (logo + title + "configured/not" hint + enable toggle) → optional sandbox/mode chip → masked write-only credential fields → optional **copy-able callback/IPN URL row** → **"সংযোগ পরীক্ষা করুন" (Test Connection)** button with result states → save bar. Generalizes the existing `BkashForm`/`SteadfastForm` into one contract so bKash, Nagad, SSLCommerz, Steadfast, Pathao, RedX, Paperfly, SMS, WhatsApp, GA4/Pixel all look and behave identically. | §Q4 (all providers) |
| **`<CopyField>`** | Read-only mono value + copy-to-clipboard button with a "কপি হয়েছে ✓" 1.5s confirm. **Load-bearing**: Nagad/SSLCommerz IPN URLs, custom-domain DNS records, and subdomain all require error-free copy or the integration silently breaks. One accessible, keyboard-operable copy primitive beats five hand-rolled ones. | §Q4, §Q5, §P6 |
| **`<ToggleSwitch>`** | The enable/disable toggle is currently a raw `<input type=checkbox>` styled inline in each form. Promote to one 44px-target, focus-ringed, labelled switch (on=`primary`, bKash row=`bkash`). | §Q1, §Q4, §Q6, §P6 |
| **`<TestConnectionButton>`** | Async test with four explicit visual states (idle / testing / success / fail-with-reason). Distinct from a generic submit button because the **result is the point** — sellers must see proof the creds work before they trust a payment rail. | §Q4 |
| **`<DiscrepancyStat>` / `<DeltaAmount>`** | Signed amount renderer: `+` over-remit = `st-shipped`/info, `−` under-remit = `warning`, missing = `danger`, matched = `cod` green. Mono, tnum, sign always shown. The reconciliation moat lives or dies on these reading unambiguously. | §Q3 |
| **`<SectionToggleRow>`** | A reorder-up/down + enable-toggle row for the fixed customizer section list. Deliberately **buttons, not free drag** (see §Q1 scope guard) — encapsulating it keeps the constraint enforced in one place. | §Q1 |
| **`<OtpInput>`** | 6-box one-time-code input (auto-advance, paste-fill, `inputmode=numeric`, Bangla-digit display, Latin value). Used on signup verify + login-via-OTP + (later) phone-change. | §Q7 |

`<EmptyState>` (icon + Bangla headline + one-line guidance + optional primary action) and a `<Skeleton>`
shimmer are also promoted to shared, since every Phase-2 list/table needs the empty + loading states
spelled out below.

---

## Q1. Visual Customizer (the big one — constrained, NOT a page builder)

Operator-facing chrome (Latin numerals in controls); the **preview pane renders the storefront** so its
content shows Bangla digits. This is the surface most at risk of scope creep — the discipline below is the
design, not a footnote. Edits a **draft** `tenant_theme_settings` row; **Publish** swaps `is_active` atomically
and `revalidateTag(tenant:{id}:theme)` (brief §2.2/2.3).

### Q1.1 The hard scope guard (design refuses these)
The customizer exposes exactly **four** control groups, mapping 1:1 to the settings JSON (brief: `colors` /
`typography` / `content` / `sections`). **No free-form anything.**

- ✅ Allowed: pick from a **5-swatch color set**, choose from **3–4 pre-approved fonts**, fill **fixed hero
  content fields**, pick **one featured collection**, and **toggle + reorder a FIXED set of ≤5 home sections**.
- 🚫 Refused (these are Phase 4, flag on sight): drag-and-drop canvas, free element positioning, custom
  HTML/CSS input, arbitrary font URLs, adding/duplicating section types, nested sections, per-section style
  overrides, image-anywhere placement. **Any control that implies a blank canvas or pixel-positioning is out.**
  The reorder control is **up/down buttons (`<SectionToggleRow>`), not a drag handle** — this is the single
  most important anti-creep decision; a drag handle is the gateway drug to a page builder.

### Q1.2 Layout — the panel/preview split (mobile-first is the whole problem here)
A seller customizing a store **on a phone** can't see controls and a live preview side-by-side. The split:

- **Mobile (base–md): preview-first, controls in a bottom sheet.** The storefront **draft preview fills the
  screen** (in a scaled, non-interactive frame). A sticky bottom bar shows: `[কাস্টমাইজ করুন]` (opens the
  controls **bottom sheet**, §7.3) on the left + **`[প্রকাশ করুন]` (Publish)** primary on the right. The
  controls sheet opens to ~70vh over the live preview, organized as an **accordion of the 4 groups** (রং /
  ফন্ট / কন্টেন্ট / সেকশন). Editing a control updates the preview **behind the sheet in real time** — the
  seller drags the sheet down a touch to peek, edits, pushes it back up. This "edit over a live preview"
  pattern is the mobile answer; a cramped side-by-side is not.
- **Desktop (≥ lg): classic left rail + live preview.** Fixed **left controls panel (`360px`, scrollable,
  the 4 groups as collapsible sections)** + **live preview filling the rest**, with a device-size toggle
  (📱 360 / 💻 1280) above the preview so the seller checks mobile — because **their buyers are on mobile**.
  Sticky footer on the panel: **draft status chip + `[প্রকাশ করুন]`**.

### Q1.3 The four control groups
1. **রং (Colors)** — 5 fields (primary, accent, background, surface, text). Each = a labelled swatch button
   opening a small picker; show a **contrast warning chip** (`warning`) if text-on-background fails AA, because
   a seller can otherwise ship an unreadable store. Offer **3–4 curated palette presets** ("দরজা ক্লাসিক",
   "সবুজ", "নীল-সোনা") as one-tap starting points — most sellers will never touch individual swatches.
2. **ফন্ট (Typography)** — `headingFont` + `bodyFont`, each a **radio list of the 3–4 pre-approved Bangla
   fonts** (Hind Siliguri default) with a live "আপনার দোকান" sample rendered in each. No upload, no URL.
3. **কন্টেন্ট (Content)** — storeName, **logo upload** (`<CopyField>`-adjacent upload tile, client-resize,
   progress on tile per §P4), heroHeadline, heroSubline, heroCta, heroImage, **featured collection** (single
   select from the tenant's collections). Bangla labels above each field; char-count hint on headline.
4. **সেকশন (Sections)** — the fixed list (`announcement_bar`, `hero`, `featured_products`, `collections_grid`,
   `trust_band`) as `<SectionToggleRow>`s: section name + enable toggle + up/down reorder. **`trust_band`'s
   toggle carries a soft warning** if disabled ("COD ট্রাস্ট সেকশন বন্ধ করলে বিশ্বাসযোগ্যতা কমে") — trust
   signals are load-bearing in this market (§9).

### Q1.4 Draft / preview / publish states
- **Draft (default working state):** an always-visible chip near Publish — `"খসড়া · অপ্রকাশিত পরিবর্তন আছে"`
  (`st-pending` weak). Edits autosave to the draft row (debounced) with a quiet "সেভ হচ্ছে…→ সেভ হয়েছে" inline.
- **Preview integrity:** preview reads the draft via the admin-gated `?preview=<draft_id>` path (brief: **must
  be server-side admin-session-gated** — note it in the UI as "শুধু আপনি দেখছেন" so the seller knows it's not live).
- **Publish:** primary button → confirm sheet ("এই পরিবর্তনগুলো লাইভ স্টোরে দেখা যাবে। প্রকাশ করবেন?") →
  success toast "🎉 লাইভ হয়েছে" + chip flips to `"প্রকাশিত · সব সেভ"` (`success` weak). One atomic swap.
- **Empty/first-run:** if the tenant has never customized, open on the **active theme's defaults** with a one-line
  coach mark "রং আর হিরো বদলে আপনার দোকান সাজান" — never a blank slate.
- **Error:** save/publish failure → inline `danger` strip with retry; preview never shows a broken half-state
  (it always renders the last good draft).

---

## Q2. Theme Catalog / Picker

Operator-facing. A **grid of 3–5 themes** (Doreja / Megh / Bazar to start, brief §2.2). Each theme is a real
component tree, not a recolor, so the picker must **show the difference**, not just a swatch.

- **Layout:** responsive grid — **1-col mobile, 2-col md, 3-col lg** of theme cards (`--color-surface`,
  `--radius-lg`, hairline, `--shadow-xs`; hover lift on md+ per §6.3).
- **Theme card anatomy:** a **storefront thumbnail preview image** (1.4:1, the theme's hero+grid look) ·
  theme name (`h3`) · one-line Bangla descriptor + a tiny **category chip** (general / fashion / electronics) ·
  footer action. **The active theme** gets an indigo ring (`2px --color-primary`) + a **"বর্তমান থিম" check
  badge** (top-left, `success` weak) and its action reads `[প্রিভিউ দেখুন]` instead of Activate.
- **Preview-before-activate:** every card has **`[প্রিভিউ]`** → opens the storefront in the theme's defaults
  via the same admin-gated `?preview` path (full-screen on mobile, large dialog on desktop, with a sticky
  `[এই থিম চালু করুন]` bar so preview converts to activate in one place).
- **Activate (confirm):** `[এই থিম চালু করুন]` → confirm sheet warning that **custom colors/content may need
  re-checking** because themes differ structurally ("নতুন থিমে আপনার রং আর হিরো আবার দেখে নিন") → success →
  lands the seller in the **§Q1 customizer** on the new theme (the natural next step). Activation creates a new
  `tenant_theme_settings` row + revalidates (brief §2.2).
- **States:** loading = 3 `<Skeleton>` cards; only-one-theme-ever shouldn't happen (always ≥3 shipped), but if a
  fetch fails → `<EmptyState>` "থিম লোড হয়নি — আবার চেষ্টা করুন". No empty state in normal operation.

---

## Q3. COD & Settlements view (THE differentiator — make discrepancies unmissable)

Operator-facing, **Latin + `tabular-nums` + `--font-mono` for every amount** (§4.4) — alignment *is* the trust
signal here. This is the moat: sellers must believe the numbers more than they believe the courier. The whole
surface is engineered so a **discrepancy is impossible to miss** and a **matched batch is visibly calm**.
Money words: expected = `cod_amount`, collected = `cod_collected`, remitted = `cod_remitted`,
discrepancy = `discrepancy_amount` (brief §2.6).

### Q3.1 Summary band (top — the morning glance)
Four metric tiles (§P2.3 metric-card pattern), 2-col mobile / 4-col md, each mono-tnum `--text-2xl`:
- **প্রত্যাশিত COD** (expected) — neutral ink. The baseline.
- **সংগৃহীত** (collected) — `cod` green.
- **জমা হয়েছে** (remitted) — `cod` green.
- **গরমিল / বকেয়া** (discrepancy delta) — **the loud one**: `danger` if net-negative/missing, `warning` if
  unresolved-but-small, `cod` green + "✓ সব মিলেছে" if zero. This tile is the headline: a seller should know
  in one glance whether the courier owes them money. Tappable → filters the table to discrepancies.

### Q3.2 Per-shipment match table (the evidence)
- **Desktop ≥ md:** zebra table (§7.5), sticky header. Columns: Consignment# (mono) · Order# (mono) · Customer ·
  **Expected** (right, mono) · **Collected** (right, mono) · **Remitted** (right, mono) · **Δ Discrepancy**
  (right, **`<DeltaAmount>`** — signed, colored) · **`<StatusBadge kind="cod">`** · Batch ref · ⋯.
- **The unmissable treatment:** any row where `cod_status = discrepancy` gets a **`danger`-weak row tint + a 3px
  `danger` left edge bar + the `গরমিল` chip**. "No remittance for a delivered shipment" (the most serious case)
  additionally shows a **`⚠ রেমিট্যান্স পাওয়া যায়নি`** inline flag. Matched/`reconciled` rows stay calm
  (`cod` green chip, no tint) so the eye is pulled only to problems. Color **+ icon + text**, never color alone (§7.4).
- **Mobile = stacked cards** (§7.5, never a swiped table for money): consignment# + cod chip top row; a compact
  **expected → collected → remitted** mini-ladder with the **Δ as the loud line**; discrepancy cards float to the
  top of the list and carry the `danger` edge.
- **Filters:** cod_status pills (সব · মিলেছে · গরমিল · সংগ্রহ বাকি · রেমিট বাকি) with counts; search by
  consignment/order/phone; date range.
- **Per-discrepancy action:** **`[সমাধান হয়েছে চিহ্নিত করুন]`** (Mark-Resolved, after the seller settles with
  the courier) — manual override (brief §2.6), behind a confirm so it's deliberate; resolving clears the tint.

### Q3.3 Remittance batch upload (CSV)
- A **`[রেমিট্যান্স CSV আপলোড করুন]`** primary action opens an **upload + map sheet**: drop/select CSV →
  show a **parsed preview table (first N rows)** → "X লাইন মিলেছে · Y লাইন মেলেনি" summary **before** commit →
  confirm to ingest (creates the `cod_remittance` batch, brief §2.6). 500-row Phase-2 limit surfaced as a hint.
- **States:** parsing = progress on the sheet; **partial-match result is first-class** — unmatched lines aren't
  a silent failure, they render as a **`warning` "মেলেনি (Y)" expandable list** the seller can act on; hard parse
  error → `danger` strip naming the bad column/row so the seller can fix the file. Empty (no batches yet) →
  `<EmptyState>` "এখনো কোনো রেমিট্যান্স আপলোড হয়নি — কুরিয়ার থেকে CSV নামিয়ে আপলোড করুন".
- **Batch list:** below the table — each batch = reference (mono) · provider · total (mono) · date · matched/
  unmatched counts · status chip (pending/processed/failed). Tap → that batch's lines.

### Q3.4 Trust-signal styling (this surface earns belief)
Because this is the moat, lean into **printed-ledger calm**: hairline rules, mono-tnum columns that line up to
the paisa, the `cod` green reserved exclusively for "money accounted for", and a small footer line
"সব হিসাব আপনার নিজের ডেটা থেকে — Hybrid কোনো টাকা ছোঁয় না" (we never touch the money — we just reconcile it).
That sentence is a deliberate trust lever; keep it.

---

## Q4. Per-provider Settings UI (one card pattern, every integration)

Operator-facing. Each tenant configures **their own** bKash / Nagad / SSLCommerz / Steadfast / Pathao / RedX /
Paperfly / SMS / WhatsApp / analytics creds. The existing `BkashForm`/`SteadfastForm` already encode the right
DNA (masked write-only secrets, configured-hint, enable toggle, save bar). Phase 2 **generalizes that into one
`<ProviderCard>`** so all ten providers are visually and behaviorally identical — learn it once, configure any.

### Q4.1 The `<ProviderCard>` anatomy (fixed, top→bottom)
1. **Header row:** provider logo/glyph + name + **configured hint** ("কনফিগার করা আছে" / "এখনো হয়নি") +
   **`<ToggleSwitch>`** (on/off). bKash row uses `bkash` pink for its toggle+glyph (the **only** admin pink, §P9);
   every other provider uses neutral/`primary`.
2. **Mode/sandbox chip (optional):** sandbox vs live switch with the existing `warning` sandbox note (bKash,
   SSLCommerz, Pathao stage). Honest "no sandbox" note where true (Steadfast, §P6).
3. **Credential fields:** masked, **write-only** (render empty + "•••• সেভ করা আছে" hint, blank-keeps-saved) —
   exactly today's pattern. Field set varies per provider (bKash: app_key/secret/username/password; Pathao:
   client_id/secret/username/password; SMS: api_key/sender_id; WhatsApp: WABA id/phone-number-id/token).
4. **Callback / IPN URL row (the silent-failure guard):** for **Nagad and SSLCommerz**, a **`<CopyField>`**
   showing the exact per-tenant IPN/callback URL the seller must paste into the gateway portal, with a Bangla
   instruction line ("এই URL আপনার [Nagad] পোর্টালে IPN হিসেবে বসান — না বসালে পেমেন্ট কনফার্ম হবে না").
   **This is non-optional**: without it, payments succeed at the gateway but never confirm in Hybrid — a silent,
   trust-destroying failure. bKash uses a server-set callback (no paste needed) so it shows the URL read-only as
   reassurance, not as a required step.
5. **Test Connection:** **`<TestConnectionButton>`** "সংযোগ পরীক্ষা করুন" → four states: idle ·
   **testing** (spinner, "পরীক্ষা চলছে…") · **success** (`success` strip "✓ সংযোগ ঠিক আছে · ব্যালেন্স ৳N" for
   couriers / "✓ টোকেন পাওয়া গেছে" for gateways) · **fail** (`danger` strip with the **actual reason** —
   "ভুল app_secret" / "নেটওয়ার্ক সমস্যা" — never a generic "failed"). The result is the point: it's proof before trust.
6. **Save bar:** the existing dirty-only "সেভ করুন" button + saved/error strips.

### Q4.2 Settings information architecture
Group the cards so the long list stays calm (§P6 pattern): **পেমেন্ট** (bKash, Nagad, SSLCommerz, COD) ·
**কুরিয়ার** (Steadfast, Pathao, RedX, Paperfly) · **নোটিফিকেশন** (SMS, WhatsApp) · **অ্যানালিটিক্স**
(GA4/Pixel). Mobile = section list → detail; desktop = settings left-nav + right panel. Each provider that's
**not-yet-live in Phase 2** (RedX/Paperfly) shows a `warning` "শীঘ্রই আসছে" state with the toggle disabled —
honest, not a dead control.

---

## Q5. Custom Domain Connect flow

Operator-facing. Add domain → show DNS records → track verification/SSL states → set primary. The seller is
non-technical and DNS is scary; the design's job is **calm, copy-able guidance + honest timing** so they don't
panic or open a support ticket (brief §2.1). Backed by existing `tenant_domain` (`verified`, `ssl_status`).

### Q5.1 Flow
1. **Add domain:** single input "আপনার ডোমেইন" (`yourstore.com`, no http://, validated) → `[যোগ করুন]`.
2. **DNS records card** (the heart): show **both records simultaneously** as **`<CopyField>` rows** —
   - Apex: **A** · `@` · `76.76.21.21`
   - www: **CNAME** · `www` · `<VERCEL_CNAME_TARGET>` (from env, never hardcoded — brief §2.1)
   Each row: record-type chip + host + value-with-copy. A plain-Bangla intro: "আপনার ডোমেইন প্রোভাইডারে
   (যেমন GoDaddy / Namecheap) নিচের রেকর্ডগুলো যোগ করুন।" Plus a **`<CopyField>`** caveat for the **CAA edge
   case** when relevant ("CAA রেকর্ড থাকলে `0 issue letsencrypt.org` যোগ করুন — নাহলে SSL আসবে না").
3. **Set expectations (the support-ticket preventer):** an `info`/`primary-weak` note: "DNS পরিবর্তন ছড়াতে
   কয়েক ঘণ্টা (কখনো ৪৮ ঘণ্টা পর্যন্ত) লাগতে পারে — এটা স্বাভাবিক। আমরা নিজে থেকে চেক করতে থাকব।" Plus a manual
   **`[স্ট্যাটাস চেক করুন]`** so the seller isn't passive while polling runs.

### Q5.2 State machine (mapped to `verified` + `ssl_status`, brief §2.1)
A **vertical 3-step status stepper** (reusing the §P3.2 stepper visual vocabulary — color+icon+label):
- **`pending_dns`** — `st-pending` "DNS-এর অপেক্ষায়" (records shown, polling). Honest timing note visible.
- **`dns_verified`** — `st-confirmed` "DNS মিলেছে · SSL তৈরি হচ্ছে" with a sub-line "🔒 সার্টিফিকেট আসছে (২–১০
  মিনিট)" — **critically, DNS-verified and SSL-issued are two separate states** (brief: API may say verified
  before the cert works), so we never claim "live" at this step.
- **`ssl_issued`** — `st-delivered` green "✓ লাইভ · নিরাপদ (HTTPS)" — the domain is genuinely usable. Only now
  does **`[প্রাইমারি করুন]` (Set primary)** light up.
- **`failed`** — `danger` "সংযোগ ব্যর্থ" + the specific reason (no TXT / wrong value / CAA blocked / 48h timeout)
  + a `[আবার চেষ্টা করুন]`. Never a dead end.
- **Set-primary:** confirm sheet (www↔apex 308 redirect is configured server-side); the subdomain stays as a
  permanent fallback shown read-only with `<CopyField>`.
- **Empty state:** no custom domain yet → `<EmptyState>` showing the **current live subdomain** (`<CopyField>`)
  + "আপনার নিজের ডোমেইন যোগ করুন (যেমন yourstore.com)" + add button. The seller always has a working URL.

---

## Q6. Discounts admin

Operator-facing (Latin + mono for codes/amounts). Coupon list + create/edit form, backed by the existing
`discount` table (brief §2.4). Calm CRUD — one primary action per screen (§2).

- **List:** stacked cards on mobile / table ≥ md. Per row: **code** (mono, prominent) · type+value ("২০%" /
  "৳১০০" / "ফ্রি ডেলিভারি") · usage ("12 / 100" used, mono tnum) · **active-window** as a small date range ·
  **status `<StatusBadge>`** mapping the `status` enum (active=`success`, scheduled=`st-confirmed`,
  expired=muted, disabled=`st-pending`) · ⋯ (edit / disable / delete-confirm). Filter pills সব · চালু · সময়সূচি ·
  মেয়াদোত্তীর্ণ; search by code. **Empty** → `<EmptyState>` "প্রথম কুপন তৈরি করুন — বিক্রি বাড়ান" + create CTA.
- **Create/edit form (single column ≤ md, main+aside ≥ lg):**
  - **Code** (mono input, auto-UPPERCASE, with a **[র‍্যান্ডম কোড]** generator) + a **type segmented control**
    (শতকরা % / নির্দিষ্ট ৳ / ফ্রি ডেলিভারি) that **swaps the value field's affix** (% suffix vs ৳ prefix vs
    hides value for free-shipping). The dependent-field reveal is the one bit of conditional UI; keep it obvious.
  - **value** · **min-cart** (`min_subtotal`, ৳ mono) · **usage limit** (`usage_limit`) · **per-customer limit**
    (`per_customer_limit`) — all numeric `inputmode`, each with a Bangla helper line.
  - **Active window:** starts_at / ends_at date-time (each a **bottom-sheet date picker** on mobile, §7.3) with a
    plain-language live summary "১ জুন – ৩০ জুন সক্রিয় থাকবে". Blank end = "মেয়াদ নেই".
  - **Aside / below:** status toggle (`<ToggleSwitch>`), a **live preview chip** of how the code reads to a buyer
    ("SAVE20 দিলে ২০% ছাড়"). No client-side cart preview (brief: discount is validated server-side at checkout to
    avoid race conditions, §2.4) — so the form never promises a total, only describes the rule.
  - **Save bar:** dirty-only "সেভ করুন"; delete = `danger` confirm.

---

## Q7. Own-auth surfaces (production signup / login, replacing dev-login)

Buyer-of-the-product facing — **the seller is the user**. Per §2 this is between Marketing (warm, spacious) and
Admin (calm); treat it as **trust-forward, mobile-first, Bengali-first**, since it's the first real impression of
product quality (extends §P8.2). **Numerals: Bangla digits** in display copy; OTP value stored Latin. Single
column, big 44px+ inputs, labels above fields (never placeholder-only — §P1.2).

### Q7.1 Signup
- **One screen, minimal:** **phone** (`type=tel`, `inputmode=tel`, **first** — it's the BD identity channel, §P8.2)
  · **email** (optional-but-offered) · **password** (with a show/hide toggle + a quiet strength hint, not a nag).
  Trust line under the CTA: **"ক্রেডিট কার্ড লাগবে না · ১৪ দিন ফ্রি"** (§P8.2).
- **Primary `[অ্যাকাউন্ট খুলুন]`** indigo, full-width 52px. Below: "আগে থেকে অ্যাকাউন্ট আছে? **লগইন করুন**".
- **Brand reassurance, not chrome:** a slim header lockup + one line of why-trust ("বাংলাদেশের সেলারদের জন্য
  তৈরি"). No foreign-template hero, no social-login clutter in Phase 2 (phone+password+OTP only). Light, warm,
  Hind Siliguri — the §9 screenshot test applies hardest here.

### Q7.2 OTP verification (the trust gate)
- After signup (and as a login path), a **6-box `<OtpInput>`** screen: "আপনার ফোনে পাঠানো ৬-সংখ্যার কোডটি দিন"
  + the masked phone ("০১৭••••১২৩৪", Bangla digits) · auto-advance + paste-fill · a **resend countdown**
  ("আবার পাঠান (৩০ সেকেন্ড)") that re-enables on zero · a "ভুল নম্বর? বদলান" link back.
- **States:** idle · verifying (inline spinner, boxes locked) · **error** (`danger` "ভুল কোড" + boxes shake via
  `transform` per §8, not a layout jump) · **success** (boxes flip `success` green, brief check, → into the admin
  dashboard / provisioning §P8.2). Rate-limit lockout shows a calm "একটু পরে আবার চেষ্টা করুন (N মিনিট)" — never a
  scary red wall.

### Q7.3 Login
- **phone (or email)** + **password**, plus a **"কোড দিয়ে লগইন করুন" (OTP login)** alternative that routes to
  §Q7.2. "পাসওয়ার্ড ভুলে গেছেন?" link → phone-OTP reset. Same trust-forward, single-column, big-input treatment.
- **Errors are friendly + Bengali** (§ guardrail 4): wrong creds → "ফোন নম্বর বা পাসওয়ার্ড মিলছে না" (never leak
  which one). No raw error codes ever reach the seller.

---

## Q8. Phase-2 anti-slop / consistency checklist

On top of §9 and §P9, every Phase-2 surface must also pass:

- [ ] **Customizer exposes ONLY the 4 fixed control groups**; reorder is **up/down buttons, never a drag handle**;
      no free canvas / custom HTML / arbitrary fonts. Any page-builder affordance is refused (Phase 4).
- [ ] **One `<ProviderCard>` pattern** across all 10 integrations — identical header/secret/test/save anatomy;
      bKash is the only pink.
- [ ] **Nagad & SSLCommerz IPN URLs are shown as copy-able `<CopyField>` rows** with a Bangla "paste this or
      payments break" instruction. Custom-domain DNS records + subdomain are also `<CopyField>`.
- [ ] **Every async config action (Test Connection, domain check, CSV ingest, publish) has all four states**:
      idle / in-progress / success / **fail-with-specific-reason** — never a generic "failed".
- [ ] **COD discrepancies are unmissable**: `danger`-weak row tint + left edge bar + chip + (for missing) an
      explicit "রেমিট্যান্স পাওয়া যায়নি" flag; matched rows stay calm green. Δ amounts via `<DeltaAmount>`
      (signed, colored, mono-tnum). Color + icon + text always.
- [ ] **Custom-domain UI separates DNS-verified from SSL-issued** (never claims "live" before the cert) and
      **states 48h propagation timing honestly** with a manual check button.
- [ ] **Numeral split honored**: customizer controls / settings / COD / discounts admin = Latin + tnum; auth
      display copy + storefront preview = Bangla digits. OTP value stored Latin.
- [ ] **Every list/table has explicit empty + loading + error states** (`<EmptyState>` / `<Skeleton>` / `danger`
      strip) — no blank screens, no infinite spinners.
- [ ] **Mobile-first holds**: customizer = preview + controls-sheet (not side-by-side); all tables collapse to
      stacked cards < md; dialogs/date-pickers are bottom sheets; every control ≥ 44px.
- [ ] **Auth is trust-forward**: phone-first, labels-above-fields, friendly Bengali errors that never leak which
      field was wrong, OTP boxes shake (transform) on error not layout-shift, passes the §9 screenshot test.
- [ ] **Discounts form describes the rule, never promises a total** (server-side validated at checkout); the
      type segmented control swaps the value affix clearly.

---

## Phase-2 Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-24 | Customizer = preview-first + controls-in-bottom-sheet on mobile, left-rail + live preview on desktop | A mobile-only seller can't see controls and preview side-by-side; "edit over a live preview" is the only honest mobile pattern. Desktop gets the classic split with a device-size toggle so sellers check the mobile their buyers actually use. |
| 2026-06-24 | Section reorder = up/down buttons (`<SectionToggleRow>`), NOT a drag handle | A drag handle is the gateway to a free page builder (Phase 4). Buttons enforce the constrained-customizer scope in one component. The single most important anti-creep decision. |
| 2026-06-24 | One `<ProviderCard>` generalizing BkashForm/SteadfastForm for all 10 integrations | Sellers learn one config pattern; reduces surface area and visual drift; keeps bKash-pink confined to one row. |
| 2026-06-24 | Nagad/SSLCommerz IPN URL shown as a copy-able `<CopyField>` with a "paste this or payments break" Bangla note | These gateways confirm payment via IPN; a missing/mis-pasted URL is a silent, trust-destroying failure. Making the URL impossible to miss is a payment-integrity design requirement, not polish. |
| 2026-06-24 | COD discrepancies get row tint + edge bar + flag; matched rows stay calm green; signed `<DeltaAmount>` | The reconciliation engine is the moat — its trust depends entirely on a discrepancy being impossible to miss and a clean batch being visibly calm. Printed-ledger calm + reserved COD-green = belief. |
| 2026-06-24 | Custom-domain UI tracks DNS-verified and SSL-issued as separate states; states 48h timing honestly | The Vercel API can report verified before the cert is usable; claiming "live" early breaks trust. Honest timing + a manual check button prevents support tickets from non-technical sellers. |
| 2026-06-24 | Own-auth = phone-first, OTP via `<OtpInput>`, friendly Bengali errors that never leak which field failed | Phone is the BD identity channel; this is the first real impression of product quality, so it gets the trust-forward treatment, not a generic template login. |
| 2026-06-24 | Discounts form describes the rule, shows no cart-total preview | Discount validity (FOR UPDATE row lock, usage/min-cart/scope) is enforced server-side at checkout to avoid race conditions; a client preview would lie. |
