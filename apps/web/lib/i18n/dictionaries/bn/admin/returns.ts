import type { returns as En } from "../../en/admin/returns";

// Bangla mirror of the returns namespace — same keys/shape, Bangla values.
export const returns: typeof En = {
  // List page
  title: "রিটার্ন / RTO",
  backToList: "রিটার্ন তালিকা",
  empty: "কোনো রিটার্ন নেই।",
  open: "খোলা",
  rto: "RTO",
  stats: {
    openReturns: "খোলা রিটার্ন",
    rtoQueue: "RTO কিউ",
    refundedThisMonth: "এই মাসে রিফান্ড",
    refundAmount: "রিফান্ড টাকা",
  },
  statusPills: {
    all: "সব",
    requested: "অনুরোধ",
    approved: "অনুমোদিত",
    in_transit: "পথে",
    received: "গৃহীত",
    refunded: "রিফান্ডেড",
    completed: "সম্পন্ন",
    rejected: "প্রত্যাখ্যাত",
    cancelled: "বাতিল",
  },
  col: {
    customer: "গ্রাহক",
    type: "ধরন",
    reason: "কারণ",
    items: "পণ্য",
    refund: "রিফান্ড",
    status: "স্ট্যাটাস",
    date: "তারিখ",
  },
  itemsUnit: "পণ্য",

  // Status chip labels
  statusChip: {
    requested: "অনুরোধ",
    approved: "অনুমোদিত",
    rejected: "প্রত্যাখ্যাত",
    in_transit: "পথে",
    received: "গৃহীত",
    refunded: "রিফান্ডেড",
    completed: "সম্পন্ন",
    cancelled: "বাতিল",
  },
  typeChip: {
    return: "রিটার্ন",
    exchange: "এক্সচেঞ্জ",
    rto: "RTO",
  },

  // Reasons
  reason: {
    wrong_item: "ভুল পণ্য",
    damaged: "ক্ষতিগ্রস্ত",
    size_issue: "সাইজ সমস্যা",
    not_as_described: "বর্ণনা মেলেনি",
    customer_refused: "গ্রাহক প্রত্যাখ্যান",
    rto_undelivered: "ডেলিভারি ব্যর্থ",
    fake_order: "ভুয়া অর্ডার",
    other: "অন্যান্য",
  },

  // Refund methods
  method: {
    bkash: "বিকাশ",
    nagad: "নগদ",
    cash: "ক্যাশ",
    none: "—",
  },

  // Detail page
  detail: {
    heading: "রিটার্ন",
    resolved: "সমাধান",
    items: "পণ্য",
    restock: "রিস্টক",
    noRestock: "রিস্টক নয়",
    refund: "রিফান্ড",
    orderTotal: "অর্ডার মোট",
    method: "মাধ্যম",
    refundAmount: "রিফান্ড পরিমাণ",
    reverseShipment: "রিভার্স শিপমেন্ট",
    inventoryRestock: "ইনভেন্টরি রিস্টক",
    restockDone: "হয়েছে",
    restockNotDone: "হয়নি",
    note: "নোট",
    actions: "অ্যাকশন",
    customer: "গ্রাহক",
    orderDetail: "অর্ডার বিস্তারিত",
  },

  // Detail actions (client)
  actions: {
    waiting: "অপেক্ষা করুন…",
    approve: "অনুমোদন করুন",
    sendInTransit: "পথে পাঠান",
    markReceived: "গৃহীত চিহ্নিত করুন",
    complete: "সম্পন্ন করুন",
    reject: "প্রত্যাখ্যান",
    cancel: "বাতিল",
    refund: "রিফান্ড",
    refundDo: "রিফান্ড করুন",
    amount: "পরিমাণ",
    method: "মাধ্যম",
    methodNagad: "নগদ (Nagad)",
    methodNone: "রিফান্ড নয়",
  },

  // Create page + form
  create: {
    title: "নতুন রিটার্ন",
    fromOrderPrefix: "অর্ডার",
    fromOrderSuffix: "থেকে",
    instruction:
      "রিটার্ন তৈরি করতে একটি অর্ডার নির্বাচন করুন। অর্ডারের বিস্তারিত পেজ থেকে রিটার্ন শুরু করুন।",
    ordersList: "অর্ডার তালিকা",
    selectItems: "পণ্য নির্বাচন",
    qty: "Qty",
    restock: "রিস্টক",
    type: "ধরন",
    reason: "কারণ",
    noteOptional: "নোট (ঐচ্ছিক)",
    typeReturn: "রিটার্ন",
    typeExchange: "এক্সচেঞ্জ",
    submit: "রিটার্ন তৈরি করুন",
    waiting: "অপেক্ষা করুন…",
    cancel: "বাতিল",
    max: "সর্বোচ্চ",
    selectAtLeastOne: "অন্তত একটি পণ্য নির্বাচন করুন।",
    createFailed: "তৈরি করা যায়নি।",
  },
};
