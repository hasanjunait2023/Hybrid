// Payment settings admin strings (DESIGN §Q4) — COD + bKash + Nagad +
// SSLCommerz provider config. English source of truth; bn/admin/settingsPayments.ts
// mirrors this shape exactly.
export const settingsPayments = {
  // Page chrome
  backToSettings: "Settings",
  title: "Payments",

  // Shared save fallbacks (used across the provider forms)
  saveFailed: "Save failed.",
  saving: "Saving…",
  save: "Save",
  saved: "Saved.",

  // COD card
  cod: {
    title: "Cash on Delivery",
    subtitle: "Pay when you receive the product — Bangladesh's default.",
    on: "On",
    off: "Off",
  },

  // bKash card
  bkash: {
    title: "bKash",
    callbackLabel: "Callback URL (server-set, for reference)",
    username: "Username",
    password: "Password",
  },

  // Nagad card
  nagad: {
    title: "Nagad",
    callbackLabel: "Callback URL",
    callbackWarning:
      "Set this URL as the callback in your Nagad portal — without it, payments will not be confirmed.",
    callbackHint:
      "Verify a domain first — then the correct callback URL will appear here.",
  },

  // SSLCommerz card
  sslcommerz: {
    title: "SSLCommerz",
    ipnLabel: "IPN URL",
    ipnWarning:
      "Register this URL as the IPN in your SSLCommerz panel — without it, payments will not be confirmed.",
    ipnHint:
      "Verify a domain first — then the correct IPN URL will appear here.",
  },
};
