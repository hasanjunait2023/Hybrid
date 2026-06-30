// Order detail admin surface strings (detail page, status actions, courier,
// risk panel, manual payment, print invoice/packing slip). English source of
// truth; bn/admin/ordersDetail.ts mirrors this shape exactly.
export const ordersDetail = {
  backToList: "← Order list",
  source: {
    manual: "Manual",
    storefront: "Storefront",
  },
  invoice: "Invoice",
  packingSlip: "Packing slip",

  items: {
    heading: "Products",
    subtotal: "Subtotal",
    deliveryCharge: "Delivery charge",
    grandTotal: "Grand total",
  },

  payment: {
    heading: "Payment",
    transactionPrefix: "trxID:",
  },

  courier: {
    heading: "Courier",
    provider: "Provider",
    consignment: "Consignment",
    tracking: "Tracking",
    status: "Status",
  },

  customer: {
    heading: "Customer",
    messengerAria: "Messenger",
    viewDetails: "Customer details →",
  },

  shipping: {
    heading: "Delivery address",
  },

  note: {
    heading: "Note",
  },

  // Status-advance button labels, keyed by the target fulfillment status.
  statusActions: {
    confirmed: "Confirm",
    packed: "Pack",
    shipped: "Send to courier",
    delivered: "Mark delivered",
    waiting: "Please wait…",
    cancel: "Cancel",
  },

  sendCourier: {
    sentPrefix: "Sent to courier — tracking",
    sending: "Sending…",
    send: "Send to courier",
  },

  blockPhone: {
    reason: "Blocked from order page",
    failed: "Failed",
    working: "…",
    unblock: "Unblock",
    block: "Block number",
  },

  risk: {
    heading: "Risk check",
    blockedWarning: "This number is blocked — be cautious.",
    priorOrders: "Prior orders",
    duplicate24h: "Duplicates in 24h",
    cancelled: "Cancelled",
    returnedRto: "Returned / RTO",
    rtoRate: "RTO rate",
    courierSuccess: "Courier success",
    externalDisabled:
      "External fraud-check is off — showing signals from your own order history only.",
  },

  manualPayment: {
    heading: "Record payment",
    subtitle: "Verify the bKash/Nagad TrxID and mark full or advance.",
    methodLabel: "Method",
    amountLabel: "Amount",
    trxLabel: "Transaction ID (optional)",
    trxPlaceholder: "e.g. 8N7A3D9L",
    providers: {
      bkash: "bKash",
      nagad: "Nagad",
      manual: "Cash / other",
    },
    amountRequired: "Enter an amount.",
    failed: "Failed.",
    paidDone: "Marked as fully paid.",
    advanceDonePrefix: "Advance recorded — remaining COD",
    working: "…",
    markPayment: "Mark payment",
  },

  print: {
    backToOrder: "← Back to order",
    print: "Print",
    packingSlip: "Packing slip",
    invoice: "Invoice",
    orderPrefix: "Order",
    recipient: "Recipient / Deliver to",
    collectCod: "Collect on delivery / Collect COD",
    colProduct: "Product",
    colPrice: "Price",
    colQuantity: "Quantity",
    colTotal: "Total",
    subtotal: "Subtotal",
    delivery: "Delivery",
    grandTotal: "Grand total",
    paymentLabel: "Payment",
    bkash: "bKash",
    cashOnDelivery: "Cash on Delivery",
    trackingPrefix: "Tracking:",
    thankYou: "Thank you! If you don't like the product, you can return it within 7 days.",
    // O13 — TIN / BIN printed under the seller block on the invoice.
    // The numeric value itself is rendered as-is; this is just the label.
    tinPrefix: "TIN:",
    binPrefix: "BIN:",
  },

  // O22 — Manual refund UI (sprint 1)
  refund: {
    button: "Refund",
    title: "Manual refund",
    close: "Close",
    remainingLabel: "Refundable remaining",
    amountLabel: "Refund amount (৳)",
    methodLabel: "Method",
    methods: {
      bkash: "bKash",
      nagad: "Nagad",
      cash: "Cash",
    },
    payoutLabel: "Payout reference (TrxID)",
    payoutPlaceholder: "e.g. 8N5K3P2X",
    reasonLabel: "Reason (required)",
    reasonPlaceholder: "e.g. product arrived damaged",
    noteLabel: "Additional note",
    notePlaceholder: "Optional",
    restockLabel: "Restock the items",
    cancel: "Cancel",
    submit: "Refund",
    submitting: "Processing…",
    errorGeneric: "Refund failed.",
  },
  refundHistory: {
    title: "Refund history",
    empty: "No refunds on this order yet.",
    method: "Method",
    amount: "Amount",
    reference: "Reference",
    initiatedBy: "Initiated by",
    note: "Note",
    refundedAt: "Time",
  },

  // O20 — Auto-cancel of unpaid orders (sprint 1).
  autoCancel: {
    badge: "Auto-cancelled",
    reasonBadge: "Payment not received",
    heading: "Why was this cancelled?",
    body: "Payment for this order did not arrive within the time limit — the system auto-cancelled it and restocked the products.",
    sweepTitle: "Auto-cancel history",
    sweepEmpty: "No auto-cancel on this order.",
    sweepCancelledAt: "Cancelled at",
    sweepThreshold: "Threshold",
    sweepAge: "Order age",
    smsTemplate: "Message sent to the customer",
  },

  // O3 — Edit Order (sprint 1). Merchant modal to fix qty / unit_price on
  // a non-shipped order. Atomic with full audit trail.
  editOrder: {
    button: "Edit order",
    title: "Edit order",
    subtitle:
      "Change quantity or unit price for any line. The order is locked while you edit. All changes are recorded in the audit log.",
    close: "Close",
    colProduct: "Product",
    colQuantity: "Qty",
    colPrice: "Unit price",
    reasonLabel: "Reason (required)",
    reasonPlaceholder: "e.g. customer asked for 2 instead of 1, post-call price negotiation",
    cancel: "Cancel",
    submit: "Save changes",
    submitting: "Saving…",
    errorGeneric: "Edit failed.",
    errorNoChanges: "Change at least one field before saving.",
    reasonRequired: "A reason is required for the audit trail.",
  },
  editHistory: {
    title: "Edit history",
    empty: "This order has not been edited yet.",
    seq: "Edit",
    reason: "Reason",
    by: "By",
    at: "At",
    changes: "Changes",
    before: "Before",
    after: "After",
    quantity: "Quantity",
    price: "Unit price",
    lineTotal: "Line total",
  },
};
