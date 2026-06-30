// Admin settings — communications & integrations (notifications, analytics,
// courier, staff). English source of truth; bn/admin/settingsComms.ts mirrors
// this shape exactly.
export const settingsComms = {
  // Shared back-link to the settings index (used by several panels).
  settingsLink: "Settings",

  // Shared save-failure fallback used by the provider-card forms.
  saveFailed: "Save failed.",

  notifications: {
    title: "Notifications",
    sms: {
      senderIdLabel: "sender_id (optional)",
    },
    whatsapp: {
      templateWarning:
        "⚠ The Bengali order-confirmation template must be approved by Meta (Utility template). Messages can't be sent until it's approved.",
      phoneNumberIdLabel: "Phone number ID",
      accessTokenLabel: "Access token",
    },
  },

  analytics: {
    title: "Analytics",
    cardTitle: "Analytics (GA4 + Meta Pixel)",
    intro:
      "Add Google Analytics 4 and Meta (Facebook) Pixel/Conversions API. When an order completes, the Purchase event is counted only once (duplicates dropped).",
    testEventCodeLabel: "Meta Test Event Code (optional)",
  },

  courier: {
    title: "Courier",
    steadfast: {
      noSandbox:
        "⚠ Steadfast has no sandbox — a real merchant account at portal.steadfast.com.bd is required for live delivery.",
    },
  },

  staff: {
    title: "Staff & roles",
    membersUnit: "members",
    description:
      "Owners and admins can add or remove members. Roles: owner (everything), admin (management), staff (daily work).",
    emailLabel: "Email",
    nameLabel: "Name",
    roleLabel: "Role",
    roles: {
      owner: "Owner",
      admin: "Admin",
      staff: "Staff",
    },
    youSuffix: " · You",
    addMember: "Add",
    failed: "Failed.",
  },

  // R3 — per-category size chart editor on the storefront PDP.
  sizeCharts: {
    title: "Size charts",
    subtitle:
      "Publish a measurement chart per category so buyers can pick the right size from the product page.",
    categoryLabel: "Category",
    unitLabel: "Unit",
    columnLabel: "Column name (e.g. chest, length)",
    rowLabel: "Size",
    addColumn: "Add column",
    addRow: "Add size",
    removeRow: "Remove",
    save: "Save chart",
    saving: "Saving…",
    saved: "Chart saved.",
    saveFailed: "Save failed.",
    loadFailed: "Could not load size chart.",
    empty: "No size chart published yet. Pick a category above and start adding rows.",
    publishedEmpty: "—",
    unitInch: "Inches",
    unitCm: "Centimeters",
    categories: {
      clothing_top: "Clothing · top",
      clothing_bottom: "Clothing · bottom",
      clothing_dress: "Clothing · dress",
      footwear: "Footwear",
      accessories: "Accessories",
    },
    invalidCategory: "Category must be alphanumeric (a-z, 0-9, _, -).",
    invalidColumns: "Add at least the ‘size’ column.",
    invalidRows: "Add at least one size row.",
  },
};
