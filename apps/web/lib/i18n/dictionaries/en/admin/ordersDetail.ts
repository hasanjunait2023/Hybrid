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
    level: { low: "Low risk", medium: "Medium risk", high: "High risk" },
    reason: {
      blocked: "blocked number",
      duplicate: "duplicate order",
      rto: "high RTO history",
      network: "flagged on the network",
      courier: "low courier success",
    },
    networkFlagged: "⚠ Flagged by {n} other shop(s) on Hybrid.",
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
  },
};
