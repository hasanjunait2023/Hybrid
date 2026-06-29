// Bangla mirror of en/admin/customers.ts.
import type { customers as En } from "../../en/admin/customers";

export const customers: typeof En = {
  title: "গ্রাহক",
  customersUnit: "জন গ্রাহক",
  repeatUnit: "জন রিপিট",
  export: "এক্সপোর্ট",
  blockedNumbers: "ব্লকড নম্বর",

  stats: {
    totalCustomers: "মোট গ্রাহক",
    repeatCustomers: "রিপিট গ্রাহক",
    totalRevenue: "মোট আয়",
    avgSpend: "গড় খরচ",
  },

  empty: "কোনো গ্রাহক নেই।",

  table: {
    name: "নাম",
    phone: "ফোন",
    orders: "অর্ডার",
    totalSpent: "মোট খরচ",
    lastOrder: "শেষ অর্ডার",
  },

  ordersUnit: "অর্ডার",

  search: {
    placeholder: "নাম বা ফোন নম্বর",
    aria: "গ্রাহক খুঁজুন",
    recent: "সাম্প্রতিক",
    spend: "খরচ",
  },

  detail: {
    backToList: "← গ্রাহক তালিকা",
    statOrders: "অর্ডার",
    statSpent: "মোট খরচ",
    statReturns: "ফেরত",
    highReturnWarning: "উচ্চ ফেরত হার — সতর্ক থাকুন (COD ঝুঁকি)।",
    orderHistory: "অর্ডার ইতিহাস",
    noOrders: "কোনো অর্ডার নেই।",
    addresses: "ঠিকানা",
    noAddresses: "কোনো ঠিকানা নেই।",
    defaultBadge: "ডিফল্ট",
    statAov: "গড় অর্ডার মূল্য",
    lastOrder: "শেষ অর্ডার",
    never: "—",
    dueLabel: "বকেয়া বাকি",
    loyaltyLabel: "লয়্যালটি পয়েন্ট",
    pointsUnit: "পয়েন্ট",
    redeem: "রিডিম",
    redeeming: "রিডিম হচ্ছে…",
    redeemPlaceholder: "পয়েন্ট",
    redeemDone: "রিডিম হয়েছে ৳",
    timeline: {
      heading: "কার্যক্রম টাইমলাইন",
      empty: "কোনো কার্যক্রম নেই।",
      order: "অর্ডার",
      payment: "পেমেন্ট",
      ledger: "হিসাব",
      note: "নোট",
      return: "ফেরত",
    },
    rfm: {
      new: "নতুন",
      champion: "চ্যাম্পিয়ন",
      loyal: "নিয়মিত",
      active: "সক্রিয়",
      at_risk: "ঝুঁকিতে",
      lost: "হারানো",
    },
  },

  insights: {
    link: "ইনসাইট",
    title: "গ্রাহক ইনসাইট",
    subtitle: "সেরা গ্রাহক কারা, কারা হারিয়ে যাচ্ছে, আর কোহোর্ট কেমন ধরে রাখছে।",
    rfmHeading: "RFM সেগমেন্ট",
    churnHeading: "ঝুঁকিতে থাকা গ্রাহক",
    churnSubtitle: "আগে সক্রিয় ছিল, এখন চুপ — ফিরিয়ে আনার তালিকা।",
    churnEmpty: "ঝুঁকিতে কোনো গ্রাহক নেই — চমৎকার।",
    cohortHeading: "মাসভিত্তিক রিটেনশন",
    cohortSubtitle: "প্রতি মাসে নতুন গ্রাহক ও কতজন ফিরে এসেছে।",
    cohortEmpty: "যথেষ্ট ইতিহাস নেই এখনো।",
    cohortMonth: "কোহোর্ট",
    cohortNew: "নতুন",
    cohortRepeat: "ফিরেছে",
    cohortRate: "রিপিট হার",
    lastOrder: "শেষ অর্ডার",
    daysAgo: "দিন আগে",
    customersUnit: "জন গ্রাহক",
    segDesc: {
      champion: "সাম্প্রতিক, ঘনঘন, উচ্চমূল্য",
      loyal: "নিয়মিত রিপিট ক্রেতা",
      active: "সম্প্রতি সক্রিয়",
      at_risk: "কিছুদিন ধরে নিষ্ক্রিয়",
      lost: "অনেক আগে হারিয়েছে",
      new: "এখনো অর্ডার করেনি",
    },
  },

  notes: {
    heading: "নোট ও ট্যাগ",
    tagRemoveSuffix: "সরান",
    tagPlaceholder: "ট্যাগ + Enter",
    notePlaceholder: "গ্রাহক সম্পর্কে নোট…",
    saving: "সেভ হচ্ছে…",
    save: "সেভ করুন",
    saved: "সেভ হয়েছে।",
  },

  blocklist: {
    title: "ব্লকড নম্বর",
    numbersBlockedSuffix: "টি নম্বর ব্লক করা আছে",
    description:
      "ব্লক করা নম্বরের অর্ডারে সতর্কতা দেখানো হবে — COD প্রতারণা / বারবার বাতিল করা গ্রাহক ঠেকাতে।",
    phoneLabel: "ফোন নম্বর",
    reasonLabel: "কারণ (ঐচ্ছিক)",
    reasonPlaceholder: "যেমন: বারবার অর্ডার বাতিল",
    block: "ব্লক করুন",
    addFailed: "যোগ করা যায়নি।",
    removeFailed: "সরানো যায়নি।",
    empty: "কোনো নম্বর ব্লক করা নেই।",
    unblock: "আনব্লক",
  },
};
