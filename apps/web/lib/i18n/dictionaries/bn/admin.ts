// Bangla mirror of en/admin.ts.
import type { admin as EnAdmin } from "../en/admin";

export const admin: typeof EnAdmin = {
  shell: {
    badge: "অ্যাডমিন",
    nav: "অ্যাডমিন নেভিগেশন",
    storeLink: "স্টোর",
  },

  nav: {
    home: "হোম",
    orders: "অর্ডার",
    products: "পণ্য",
    customers: "গ্রাহক",
    more: "আরও",
    themes: "থিম ও ডিজাইন",
    returns: "রিটার্ন / RTO",
    cod: "ক্যাশ অন ডেলিভারি",
    reports: "রিপোর্ট ও আয়-ব্যয়",
    marketing: "মার্কেটিং",
    reviews: "রিভিউ",
    settings: "সেটিংস",
    discounts: "ডিসকাউন্ট",
    collections: "কালেকশন",
  },

  dashboard: {
    greeting: "সুপ্রভাত",
    newOrder: "নতুন অর্ডার",
    todayOrders: "আজকের অর্ডার",
    vsYesterday: "গতকালের চেয়ে",
    todaySales: "আজকের বিক্রি",
    codDue: "COD বকেয়া",
    ordersUnit: "টি অর্ডার",
    lowStock: "কম স্টক",
    awaitingConfirm: "টি অর্ডার কনফার্ম করা বাকি",
    salesTrend: "বিক্রির ধারা",
    last14days: "গত ১৪ দিন",
    days14: "১৪ দিন",
    monthSales: "এই মাসের বিক্রি",
    codCollected: "COD সংগৃহীত",
    collected: "সংগৃহীত",
    due: "বকেয়া",
    recentOrders: "সাম্প্রতিক অর্ডার",
    viewAllOrders: "সব অর্ডার দেখুন",
    noOrders: "এখনো কোনো অর্ডার নেই।",
    orderStatus: "অর্ডার স্ট্যাটাস",
    noData: "কোনো ডেটা নেই।",
  },
};
