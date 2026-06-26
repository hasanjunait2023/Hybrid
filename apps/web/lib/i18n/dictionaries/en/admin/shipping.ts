// Shipping & delivery settings (admin). Origin location + per-zone weight-based
// rates that the storefront shipping calculator consumes at checkout. English
// source of truth; bn/admin/shipping.ts mirrors this shape exactly.
export const shipping = {
  title: "Shipping & delivery",
  subtitle: "Origin location and weight-based delivery rates",

  enabledLabel: "Enable shipping calculation",
  hint: "Rates are weight-based: charge = base + per-kg × billable weight (rounded up, minimum 1 kg).",

  origin: {
    division: "Origin division",
    district: "Origin district",
    placeholder: "e.g. Dhaka",
  },

  freeAbove: "Free shipping above (৳)",
  freeAbovePlaceholder: "Leave blank to disable",
  defaultRate: "Default rate (৳)",

  zones: {
    sameDistrict: "Same district",
    sameDivision: "Same division",
    otherDivision: "Other division",
  },

  base: "Base (৳)",
  perKg: "Per kg (৳)",

  save: "Save",
  saved: "Saved.",
  saveFailed: "Save failed.",
};
