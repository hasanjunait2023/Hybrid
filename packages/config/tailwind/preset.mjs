// Shared Tailwind preset STUB for Hybrid.
//
// The full design-token mapping (colors, fonts, radius, shadows, motion)
// is owned by docs/DESIGN.md and will be filled in by the frontend engineer
// (Slice 3). This stub exists so apps/web and @hybrid/ui can `presets: [hybridPreset]`
// today and have the token surface land later without import churn.
//
// Token contract (CSS custom properties, defined in @hybrid/ui globals.css):
//   --color-primary / -hover / -active / -weak   (Indigo #1D4ED8 family)
//   --color-accent  / -hover / -weak             (Marigold #F59E0B family)
//   --color-bg / -surface / -surface-2 / -border / -border-strong
//   --color-text / -muted / -subtle / -on-primary
//   --color-success|cod|warning|danger (+ -weak)
//   --font-bangla | -latin | -display | -mono
//   --radius-sm|md|lg|xl|full  --shadow-xs..lg  --dur-* / --ease-*

/** @type {import('tailwindcss').Config} */
const preset = {
  content: [],
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
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        text: {
          DEFAULT: "var(--color-text)",
          muted: "var(--color-text-muted)",
          subtle: "var(--color-text-subtle)",
        },
        success: { DEFAULT: "var(--color-success)", weak: "var(--color-success-weak)" },
        cod: { DEFAULT: "var(--color-cod)", weak: "var(--color-cod-weak)" },
        warning: { DEFAULT: "var(--color-warning)", weak: "var(--color-warning-weak)" },
        danger: { DEFAULT: "var(--color-danger)", weak: "var(--color-danger-weak)" },
      },
      fontFamily: {
        bangla: ["var(--font-bangla)"],
        latin: ["var(--font-latin)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
    },
  },
  plugins: [],
};

export default preset;
