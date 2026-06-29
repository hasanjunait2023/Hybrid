// Custom ESLint flat-config fragment: forbid hardcoded color literals.
//
// Every color in the app must come from a design token (docs/DESIGN.md §3) —
// a Tailwind token utility (`bg-primary`, `text-cod`, …) or a CSS custom
// property (`[var(--color-…)]`, `[var(--pf-…)]`). A raw hex literal in JSX
// (`bg-[#1d4ed8]`, `style={{ color: "#fff" }}`) is how the design system drifts:
// each surface ends up with its own off-palette shade. This rule makes that a
// build-breaking error, the same way no-raw-sql guards RLS.
//
// Apply this fragment in a consumer's eslint.config.mjs (it is composed into
// @hybrid/config/eslint/next). Self-contained: defines the plugin + rule + the
// grandfathered-file baseline in one object, so it drops in like no-raw-sql.

// #rgb · #rgba · #rrggbb · #rrggbbaa — the only forms worth flagging.
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;

// Files where a raw hex is legitimate DATA, not a styling choice, OR is
// pre-existing debt not yet migrated. New files anywhere else are gated.
// Paths are matched as substrings against the (forward-slash-normalised) file.
const BASELINE = [
  // ── LEGIT: hex is data / required by a non-CSS API, keep as-is ──
  "/lib/theme/", //                tenant theme definitions (color values ARE data)
  "/lib/storefront/data.ts", //    default theme color (data)
  "/app/manifest.ts", //           PWA theme_color — must be a hex string
  "/(platform)/platform/layout.tsx", // viewport.themeColor metadata — must be hex
  "/admin/themes/ThemeCatalog", // theme preview swatches (data)
  "/admin/themes/customize/controls/", // color / typography pickers (hex is the value)
  "/_components/PartnerLogos", //  third-party brand logo SVG fills
  "/_components/Avatar", //        deterministic avatar fill from a seed
  "/_components/MarketingImage", //placeholder/blur fill
  "/admin/DashboardCharts", //     data-viz series colors
  "/admin/DashboardWidgets", //    data-viz series colors

  // ── DEBT: pre-existing styling hex, grandfathered. Migrate to tokens. ──
  // TODO(design-tokens): tokenize and remove from this list.
  "/(marketing)/page.tsx",
  "/(admin)/admin/loading.tsx",
  "/(admin)/admin/page.tsx",
  "/(admin)/admin/orders/page.tsx",
  "/customers/[id]/CustomerTimeline",
  "/orders/[id]/print/PrintTrigger",
];

/** @type {import('eslint').Rule.RuleModule} */
const noHardcodedColorRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded hex colors in app code; use design tokens (docs/DESIGN.md §3).",
    },
    messages: {
      hex:
        "Hardcoded color \"{{value}}\". Use a design token instead — a Tailwind token utility (bg-primary, text-ink, text-cod …) or a CSS var ([var(--color-…)] / [var(--pf-…)]). See docs/DESIGN.md §3.",
    },
    schema: [],
  },
  create(context) {
    const filename = (context.filename || context.getFilename() || "").replace(/\\/g, "/");
    if (BASELINE.some((p) => filename.includes(p))) return {};

    const report = (node, text) => {
      if (typeof text !== "string") return;
      const m = text.match(HEX);
      if (m) context.report({ node, messageId: "hex", data: { value: m[0] } });
    };

    return {
      Literal(node) {
        report(node, node.value);
      },
      TemplateElement(node) {
        report(node, node.value && node.value.raw);
      },
    };
  },
};

/** @type {import('eslint').Linter.Config} */
export const noHardcodedColor = {
  name: "hybrid/no-hardcoded-color",
  plugins: {
    hybrid: { rules: { "no-hardcoded-color": noHardcodedColorRule } },
  },
  rules: {
    "hybrid/no-hardcoded-color": "error",
  },
};

export default noHardcodedColor;
