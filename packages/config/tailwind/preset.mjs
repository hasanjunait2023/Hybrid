// Shared Tailwind preset for Hybrid — "Bazaar Modern" design system.
//
// Maps the CSS custom properties defined in @hybrid/ui globals.css (the token
// contract, owned by docs/DESIGN.md §3) onto Tailwind's theme so utilities
// (bg-primary, text-cod, rounded-lg, shadow-md, ...) resolve to our tokens.
// Tenant accent is overridden per-request as an inline --color-primary on
// <html>, so utilities like `bg-primary` track the active tenant automatically.

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
        surface: {
          DEFAULT: "var(--color-surface)",
          2: "var(--color-surface-2)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        ink: {
          DEFAULT: "var(--color-text)",
          muted: "var(--color-text-muted)",
          subtle: "var(--color-text-subtle)",
          "on-primary": "var(--color-text-on-primary)",
        },
        success: { DEFAULT: "var(--color-success)", weak: "var(--color-success-weak)" },
        cod: { DEFAULT: "var(--color-cod)", weak: "var(--color-cod-weak)" },
        warning: { DEFAULT: "var(--color-warning)", weak: "var(--color-warning-weak)" },
        danger: { DEFAULT: "var(--color-danger)", weak: "var(--color-danger-weak)" },
        // Phase-1 lifecycle status tokens (DESIGN §P0) — one color per state.
        st: {
          pending: { DEFAULT: "var(--color-st-pending)", weak: "var(--color-st-pending-weak)" },
          confirmed: { DEFAULT: "var(--color-st-confirmed)", weak: "var(--color-st-confirmed-weak)" },
          packed: { DEFAULT: "var(--color-st-packed)", weak: "var(--color-st-packed-weak)" },
          shipped: { DEFAULT: "var(--color-st-shipped)", weak: "var(--color-st-shipped-weak)" },
          delivered: { DEFAULT: "var(--color-st-delivered)", weak: "var(--color-st-delivered-weak)" },
          returned: { DEFAULT: "var(--color-st-returned)", weak: "var(--color-st-returned-weak)" },
          cancelled: { DEFAULT: "var(--color-st-cancelled)", weak: "var(--color-st-cancelled-weak)" },
        },
        // bKash brand pink (DESIGN §P0) — single-purpose payment accent.
        bkash: {
          DEFAULT: "var(--color-bkash)",
          weak: "var(--color-bkash-weak)",
          text: "var(--color-bkash-text)",
        },
      },
      fontFamily: {
        bangla: ["var(--font-bangla)"],
        latin: ["var(--font-latin)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        "2xs": "var(--text-2xs)",
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        "2xl": "var(--text-2xl)",
        "3xl": "var(--text-3xl)",
        "4xl": "var(--text-4xl)",
      },
      lineHeight: {
        "bangla-tight": "var(--leading-bangla-tight)",
        bangla: "var(--leading-bangla)",
        latin: "var(--leading-latin)",
        none: "var(--leading-none)",
      },
      spacing: {
        section: "var(--space-section)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        focus: "var(--shadow-focus)",
      },
      transitionTimingFunction: {
        "out-soft": "var(--ease-out)",
        "in-soft": "var(--ease-in)",
        move: "var(--ease-in-out)",
      },
      transitionDuration: {
        instant: "100ms",
        fast: "180ms",
        base: "260ms",
        slow: "400ms",
      },
      zIndex: {
        base: "0",
        sticky: "10",
        dropdown: "1000",
        overlay: "1100",
        modal: "1200",
        toast: "1300",
        tooltip: "1400",
      },
      maxWidth: {
        storefront: "1200px",
        admin: "1280px",
        marketing: "1120px",
      },
      keyframes: {
        "pulse-scale": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.18)" },
        },
      },
      animation: {
        "pulse-scale": "pulse-scale 300ms var(--ease-out)",
      },
    },
  },
  plugins: [],
};

export default preset;
