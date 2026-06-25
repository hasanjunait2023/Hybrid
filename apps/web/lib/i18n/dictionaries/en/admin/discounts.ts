// Discounts admin surface strings (DESIGN §Q6). English source of truth;
// bn/admin/discounts.ts mirrors this shape exactly.
export const discounts = {
  title: "Discounts",
  countSuffix: "discounts",
  newDiscount: "New discount",
  empty: "No discounts.",

  describe: {
    percentOff: "% off",
    fixedOffPrefix: "৳",
    fixedOffSuffix: "off",
    freeShipping: "Free delivery",
  },

  status: {
    active: "Active",
    scheduled: "Scheduled",
    disabled: "Disabled",
    expired: "Expired",
  },

  form: {
    backToDiscounts: "Discounts",
    newDiscount: "New discount",
    code: "Code",
    titleOptional: "Title (optional)",
    type: "Type",
    typePercentage: "Percentage (%)",
    typeFixed: "Fixed (৳)",
    typeFreeShipping: "Free delivery",
    percentValue: "Percentage value (%)",
    fixedValue: "Discount amount (৳)",
    minCart: "Minimum cart value (৳)",
    totalUsageLimit: "Total usage limit",
    perCustomerLimit: "Per-customer limit",
    unlimited: "Unlimited",
    starts: "Start",
    ends: "End",
    statusLabel: "Status",
    saving: "Saving…",
    save: "Save",
    createDiscount: "Create discount",
    delete: "Delete",
    saveFailed: "Save failed.",
  },
};
