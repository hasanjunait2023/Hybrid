// Admin theme & design surface strings (catalog, customizer, control groups).
// English source of truth; bn/admin/themes.ts mirrors this shape exactly.
export const themes = {
  title: "Theme & design",
  subtitle: "Pick a theme, then customize colors, fonts, and content.",

  catalog: {
    activateFailed: "Could not activate the theme.",
    category: {
      general: "General",
      fashion: "Fashion",
      electronics: "Electronics",
    },
    preview: "Preview",
    customize: "Customize",
    activate: "Activate this theme",
    currentTheme: "Current theme",
    confirm: {
      title: "Activate the {theme} theme?",
      body: "Review your colors and hero again on the new theme — themes have different structures, so some customization may need to be redone. This will not go live to your store now; you customize and then publish.",
      cancel: "Cancel",
      activating: "Activating…",
      activate: "Activate",
    },
  },

  customizer: {
    heading: "Customize",
    groups: {
      colors: "Colors",
      typography: "Fonts",
      content: "Content",
      sections: "Sections",
    },
    publish: "Publish",
    customizeButton: "Customize",
    controlsLabel: "Customize controls",
    closeSheet: "Close",
    sheetClose: "Close",
    publishFailed: "Could not publish.",
    status: {
      saving: "Saving…",
      saveError: "Not saved — try again",
      draft: "Draft · has unpublished changes",
      published: "Published · all saved",
    },
    device: {
      mobile: "📱 360",
      desktop: "💻 1280",
    },
    preview: {
      title: "Store preview",
      unavailable: "Preview is unavailable.",
    },
    publishConfirm: {
      title: "Publish?",
      body: "These changes will be visible on your live store.",
      cancel: "Cancel",
      publishing: "Publishing…",
      publish: "Publish",
    },
  },

  colors: {
    presetLabel: "Presets",
    fields: {
      primary: "Primary (buttons)",
      accent: "Accent (sale tags)",
      background: "Background",
      surface: "Card / surface",
      text: "Text color",
    },
    presets: {
      dorejaClassic: "Doreja Classic",
      green: "Green",
      blueGold: "Blue-Gold",
    },
    contrastWarning:
      "⚠ Low contrast between text and background ({ratio}:1) — may be hard to read.",
  },

  typography: {
    headingFont: "Heading font",
    bodyFont: "Body font",
    sampleText: "Your store",
  },

  content: {
    storeName: "Store name",
    logoUrl: "Logo URL",
    heroSection: "Hero section",
    headline: "Headline",
    headlineHint: "{count} characters left",
    subline: "Subline",
    ctaText: "Button text",
    heroImageUrl: "Hero image URL",
    featuredCollection: "Featured collection",
    none: "— None —",
  },

  sections: {
    hint: "Turn sections on/off and reorder them. New sections cannot be added.",
    trustWarning: "Turning off the COD trust section reduces credibility.",
    labels: {
      announcement_bar: "Announcement bar",
      hero: "Hero banner",
      featured_products: "Featured products",
      collections_grid: "Collections grid",
      trust_band: "Trust section (COD)",
    },
  },
};
