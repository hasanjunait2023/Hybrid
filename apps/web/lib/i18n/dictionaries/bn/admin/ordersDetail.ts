// Bangla mirror of en/admin/ordersDetail.ts.
import type { ordersDetail as En } from "../../en/admin/ordersDetail";

export const ordersDetail: typeof En = {
  backToList: "← অর্ডার তালিকা",
  source: {
    manual: "ম্যানুয়াল",
    storefront: "স্টোরফ্রন্ট",
  },
  invoice: "ইনভয়েস",
  packingSlip: "প্যাকিং স্লিপ",

  items: {
    heading: "পণ্য",
    subtotal: "সাবটোটাল",
    deliveryCharge: "ডেলিভারি চার্জ",
    grandTotal: "সর্বমোট",
  },

  payment: {
    heading: "পেমেন্ট",
    transactionPrefix: "trxID:",
  },

  courier: {
    heading: "কুরিয়ার",
    provider: "প্রোভাইডার",
    consignment: "কনসাইনমেন্ট",
    tracking: "ট্র্যাকিং",
    status: "স্ট্যাটাস",
  },

  customer: {
    heading: "গ্রাহক",
    messengerAria: "Messenger",
    viewDetails: "গ্রাহকের বিস্তারিত →",
  },

  shipping: {
    heading: "ডেলিভারি ঠিকানা",
  },

  note: {
    heading: "নোট",
  },

  statusActions: {
    confirmed: "নিশ্চিত করুন",
    packed: "প্যাক করুন",
    shipped: "কুরিয়ারে পাঠান",
    delivered: "ডেলিভার্ড করুন",
    waiting: "অপেক্ষা করুন…",
    cancel: "বাতিল করুন",
  },

  sendCourier: {
    sentPrefix: "কুরিয়ারে পাঠানো হয়েছে — ট্র্যাকিং",
    sending: "পাঠানো হচ্ছে…",
    send: "কুরিয়ারে পাঠান",
  },

  blockPhone: {
    reason: "অর্ডার পেজ থেকে ব্লক",
    failed: "ব্যর্থ",
    working: "…",
    unblock: "আনব্লক",
    block: "নম্বর ব্লক করুন",
  },

  risk: {
    heading: "ঝুঁকি যাচাই",
    blockedWarning: "এই নম্বর ব্লক করা — সতর্ক থাকুন।",
    priorOrders: "আগের অর্ডার",
    duplicate24h: "২৪ঘ-এ ডুপ্লিকেট",
    cancelled: "বাতিল",
    returnedRto: "ফেরত / RTO",
    rtoRate: "RTO রেট",
    courierSuccess: "কুরিয়ার সাকসেস",
    externalDisabled:
      "বাহ্যিক ফ্রড-চেক চালু নেই — শুধু আপনার নিজের অর্ডার ইতিহাস থেকে সংকেত দেখানো হচ্ছে।",
  },

  manualPayment: {
    heading: "পেমেন্ট রেকর্ড করুন",
    subtitle: "বিকাশ/নগদ TrxID যাচাই করে সম্পূর্ণ বা অ্যাডভান্স মার্ক করুন।",
    methodLabel: "মাধ্যম",
    amountLabel: "পরিমাণ",
    trxLabel: "ট্রানজেকশন আইডি (ঐচ্ছিক)",
    trxPlaceholder: "যেমন: 8N7A3D9L",
    providers: {
      bkash: "বিকাশ",
      nagad: "নগদ",
      manual: "ক্যাশ / অন্যান্য",
    },
    amountRequired: "পরিমাণ দিন।",
    failed: "ব্যর্থ হয়েছে।",
    paidDone: "সম্পূর্ণ পরিশোধিত হিসেবে চিহ্নিত।",
    advanceDonePrefix: "অ্যাডভান্স রেকর্ড হয়েছে — বাকি COD",
    working: "…",
    markPayment: "পেমেন্ট মার্ক করুন",
  },

  print: {
    backToOrder: "← অর্ডারে ফিরুন",
    print: "প্রিন্ট করুন",
    packingSlip: "প্যাকিং স্লিপ",
    invoice: "ইনভয়েস",
    orderPrefix: "অর্ডার",
    recipient: "প্রাপক / Deliver to",
    collectCod: "ডেলিভারিতে সংগ্রহ / Collect COD",
    colProduct: "পণ্য",
    colPrice: "দাম",
    colQuantity: "পরিমাণ",
    colTotal: "মোট",
    subtotal: "সাবটোটাল",
    delivery: "ডেলিভারি",
    grandTotal: "সর্বমোট",
    paymentLabel: "পেমেন্ট",
    bkash: "বিকাশ",
    cashOnDelivery: "ক্যাশ অন ডেলিভারি",
    trackingPrefix: "ট্র্যাকিং:",
    thankYou: "ধন্যবাদ! পণ্য পছন্দ না হলে ৭ দিনের মধ্যে ফেরত দিতে পারবেন।",
  },
};
