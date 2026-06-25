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
};
