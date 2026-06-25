// Returns / RTO / Exchange admin strings. English source of truth;
// bn/admin/returns.ts mirrors this shape exactly.
export const returns = {
  // List page
  title: "Returns / RTO",
  backToList: "Returns list",
  empty: "No returns.",
  open: "open",
  rto: "RTO",
  stats: {
    openReturns: "Open returns",
    rtoQueue: "RTO queue",
    refundedThisMonth: "Refunded this month",
    refundAmount: "Refund amount",
  },
  statusPills: {
    all: "All",
    requested: "Requested",
    approved: "Approved",
    in_transit: "In transit",
    received: "Received",
    refunded: "Refunded",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
  },
  col: {
    customer: "Customer",
    type: "Type",
    reason: "Reason",
    items: "Items",
    refund: "Refund",
    status: "Status",
    date: "Date",
  },
  itemsUnit: "items",

  // Status chip labels
  statusChip: {
    requested: "Requested",
    approved: "Approved",
    rejected: "Rejected",
    in_transit: "In transit",
    received: "Received",
    refunded: "Refunded",
    completed: "Completed",
    cancelled: "Cancelled",
  },
  typeChip: {
    return: "Return",
    exchange: "Exchange",
    rto: "RTO",
  },

  // Reasons
  reason: {
    wrong_item: "Wrong item",
    damaged: "Damaged",
    size_issue: "Size issue",
    not_as_described: "Not as described",
    customer_refused: "Customer refused",
    rto_undelivered: "Delivery failed",
    fake_order: "Fake order",
    other: "Other",
  },

  // Refund methods
  method: {
    bkash: "bKash",
    nagad: "Nagad",
    cash: "Cash",
    none: "—",
  },

  // Detail page
  detail: {
    heading: "Return",
    resolved: "Resolved",
    items: "Items",
    restock: "Restock",
    noRestock: "Not restocked",
    refund: "Refund",
    orderTotal: "Order total",
    method: "Method",
    refundAmount: "Refund amount",
    reverseShipment: "Reverse shipment",
    inventoryRestock: "Inventory restock",
    restockDone: "Done",
    restockNotDone: "Not done",
    note: "Note",
    actions: "Actions",
    customer: "Customer",
    orderDetail: "Order details",
  },

  // Detail actions (client)
  actions: {
    waiting: "Please wait…",
    approve: "Approve",
    sendInTransit: "Mark in transit",
    markReceived: "Mark received",
    complete: "Complete",
    reject: "Reject",
    cancel: "Cancel",
    refund: "Refund",
    refundDo: "Issue refund",
    amount: "Amount",
    method: "Method",
    methodNagad: "Nagad",
    methodNone: "No refund",
  },

  // Create page + form
  create: {
    title: "New return",
    fromOrderPrefix: "From order",
    fromOrderSuffix: "",
    instruction:
      "Select an order to create a return. Start the return from the order's detail page.",
    ordersList: "Orders list",
    selectItems: "Select items",
    qty: "Qty",
    restock: "Restock",
    type: "Type",
    reason: "Reason",
    noteOptional: "Note (optional)",
    typeReturn: "Return",
    typeExchange: "Exchange",
    submit: "Create return",
    waiting: "Please wait…",
    cancel: "Cancel",
    max: "Max",
    selectAtLeastOne: "Select at least one item.",
    createFailed: "Could not create.",
  },
};
