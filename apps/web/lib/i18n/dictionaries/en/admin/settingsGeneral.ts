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
    staff: { label: "Staff & roles", sub: "Members, owner/admin/staff" },
    loyalty: { label: "Loyalty points", sub: "Earn rate, redeem value" },
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
