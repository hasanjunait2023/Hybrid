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
