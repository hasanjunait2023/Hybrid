// Customers admin surface strings (list, detail, notes/tags, blocklist).
// English source of truth; bn/admin/customers.ts mirrors this shape exactly.
export const customers = {
  title: "Customers",
  customersUnit: "customers",
  repeatUnit: "repeat",
  export: "Export",
  blockedNumbers: "Blocked numbers",

  stats: {
    totalCustomers: "Total customers",
    repeatCustomers: "Repeat customers",
    totalRevenue: "Total revenue",
    avgSpend: "Average spend",
  },

  empty: "No customers yet.",

  table: {
    name: "Name",
    phone: "Phone",
    orders: "Orders",
    totalSpent: "Total spent",
    lastOrder: "Last order",
  },

  ordersUnit: "orders",

  search: {
    placeholder: "Name or phone number",
    aria: "Search customers",
    recent: "Recent",
    spend: "Spend",
  },

  detail: {
    backToList: "← Customer list",
    statOrders: "Orders",
    statSpent: "Total spent",
    statReturns: "Returns",
    highReturnWarning: "High return rate — be cautious (COD risk).",
    orderHistory: "Order history",
    noOrders: "No orders.",
    addresses: "Addresses",
    noAddresses: "No addresses.",
    defaultBadge: "Default",
  },

  notes: {
    heading: "Notes & tags",
    tagRemoveSuffix: "remove",
    tagPlaceholder: "Tag + Enter",
    notePlaceholder: "Notes about this customer…",
    saving: "Saving…",
    save: "Save",
    saved: "Saved.",
  },

  blocklist: {
    title: "Blocked numbers",
    numbersBlockedSuffix: "numbers blocked",
    description:
      "Orders from blocked numbers will show a warning — to prevent COD fraud / repeat-cancelling customers.",
    phoneLabel: "Phone number",
    reasonLabel: "Reason (optional)",
    reasonPlaceholder: "e.g. repeatedly cancels orders",
    block: "Block",
    addFailed: "Could not add.",
    removeFailed: "Could not remove.",
    empty: "No numbers blocked.",
    unblock: "Unblock",
  },
};
