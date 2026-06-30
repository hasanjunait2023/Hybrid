// General settings surfaces: settings hub, store profile, custom domains,
// loyalty program, and the shared sandbox/live mode chip. English source of
// truth; bn/admin/settingsGeneral.ts mirrors this shape exactly.
export const settingsGeneral = {
  title: "Settings",

  // Settings hub section rows.
  sections: {
    payments: { label: "Payments", sub: "bKash, Nagad, SSLCommerz, COD" },
    courier: { label: "Courier", sub: "Steadfast, Pathao" },
    notifications: { label: "Notifications", sub: "SMS connection" },
    dbid: { label: "DBID Compliance", sub: "Bangladesh Digital Business ID" },
    domains: { label: "Custom domain", sub: "Add your own domain" },
    analytics: { label: "Analytics", sub: "GA4, Meta Pixel/CAPI" },
    store: { label: "Store profile", sub: "Name, phone, address, policy" },
    // O13 — TIN/BIN on invoice (Bangladesh NBR tax compliance).
    tax: { label: "Tax / Business", sub: "TIN, BIN — printed on every invoice" },
    staff: { label: "Staff & roles", sub: "Members, owner/admin/staff" },
    loyalty: { label: "Loyalty points", sub: "Earn rate, redeem value" },
    // R3 — per-category size charts on the PDP
    sizeCharts: { label: "Size charts", sub: "Publish a measurement table per category" },
  },

  // Shared mode chip (sandbox/stage/live).
  mode: {
    label: "Mode",
    sandbox: "Sandbox",
    stage: "Stage",
    live: "Live",
    testWarning:
      "mode — for testing only. For real payments/delivery, enter real details in live mode.",
  },

  // Store profile form.
  store: {
    title: "Store profile",
    storeName: "Store name",
    subdomain: "Subdomain",
    hotline: "Hotline phone",
    facebookLink: "Facebook link",
    address: "Address",
    returnPolicy: "Return policy",
    vatBin: "VAT / BIN",
  },

  // O13 — Tax / Business page. TIN (12 digits) + BIN (10 digits) per
  // Bangladesh NBR spec. Rendered on the customer-facing invoice and the
  // print packing-slip/invoice from the admin order detail.
  tax: {
    title: "Tax / Business",
    subtitle:
      "Bangladesh tax IDs printed on every invoice. Both are optional until you have them from NBR.",
    tinLabel: "TIN (Taxpayer Identification Number)",
    tinHint: "12 digits — every taxpayer",
    tinPlaceholder: "e.g. 123456789012",
    binLabel: "BIN (Business Identification Number)",
    binHint: "10 digits — registered businesses (trade-license holders)",
    binPlaceholder: "e.g. 1234567890",
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    saveFailed: "Save failed.",
    errorTinInvalid: "TIN must be exactly 12 digits.",
    errorBinInvalid: "BIN must be exactly 10 digits.",
    blankExplainer:
      "Leave blank if you don't have these yet — the invoice renders without them.",
    invoicePreview: "Invoice preview",
    invoicePreviewTin: "TIN:",
    invoicePreviewBin: "BIN:",
  },

  // Custom domains.
  domains: {
    title: "Custom domain",
    subdomainAlwaysWorks: "Your subdomain (always works)",
    yourDomain: "Your domain",
    domainHint: "Enter just the domain, without http:// or www.",
    addFailed: "Could not add.",
    adding: "Adding…",
    addDomain: "Add domain",
    empty:
      "No custom domain added yet. Add your own domain (e.g. yourstore.com).",
    primary: "Primary",
    operationFailed: "Operation failed.",
    dnsInstruction:
      "Add the records below at your domain provider (e.g. GoDaddy / Namecheap).",
    caaNote: "If you have a CAA record, add",
    caaNoteSuffix: "— otherwise SSL won't be issued.",
    dnsPropagation:
      "DNS changes can take a few hours (sometimes up to 48 hours) to propagate — this is normal. We'll keep checking automatically.",
    retry: "Try again",
    checking: "Checking…",
    checkStatus: "Check status",
    makePrimary: "Make primary",
    remove: "Remove",
    state: {
      pendingDns: "Waiting for DNS",
      dnsVerified: "DNS matched · issuing SSL",
      dnsVerifiedSub: "🔒 Certificate incoming (2–10 minutes)",
      sslIssued: "✓ Live · secure (HTTPS)",
      failed: "Connection failed",
    },
  },

  // Loyalty program.
  loyalty: {
    title: "Loyalty points",
    subtitle: "Reward your repeat buyers",
    enable: "Enable loyalty program",
    pointsPer100: "Points per ৳100",
    takaPerPoint: "1 point = how many taka",
    saveFailed: "Save failed.",
    saved: "Saved.",
    example: "Example: on a ৳1000 order the customer earns",
    examplePointsUnit: "points,",
    exampleWorth: "worth",
    exampleEnd: ".",
    save: "Save",
  },
};
