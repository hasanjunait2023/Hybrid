import type { reports as En } from "../../en/admin/reports";

// Bangla mirror of en/admin/reports.ts — same keys/shape, Bangla values.
export const reports: typeof En = {
  title: "রিপোর্ট ও আয়-ব্যয়",

  range: {
    d7: "৭ দিন",
    d30: "৩০ দিন",
    d90: "৯০ দিন",
  },

  stats: {
    totalSales: "মোট বিক্রি",
    orders: "অর্ডার",
    avgPrefix: "গড়",
    grossProfit: "গ্রস প্রফিট",
    marginPrefix: "মার্জিন",
    setCostPrice: "কস্ট প্রাইস সেট করুন",
    rtoRate: "RTO রেট",
    deliveryPrefix: "ডেলিভারি",
  },

  salesTrend: "বিক্রির ধারা",

  topProducts: "শীর্ষ পণ্য",
  noSales: "কোনো বিক্রি নেই।",
  col: {
    product: "পণ্য",
    units: "ইউনিট",
    sales: "বিক্রি",
  },

  orderStatus: "অর্ডার স্ট্যাটাস",
  noData: "ডেটা নেই।",

  cod: {
    heading: "COD হিসাব",
    out: "বকেয়া (পথে)",
    collected: "সংগৃহীত",
    remitted: "রেমিট হয়েছে",
    pending: "রেমিট বাকি",
  },

  courier: {
    heading: "কুরিয়ার পারফরম্যান্স",
    empty: "এখনো কোনো চালান নেই।",
    col: {
      courier: "কুরিয়ার",
      sent: "পাঠানো",
      delivered: "ডেলিভার্ড",
      deliveryRate: "ডেলিভারি রেট",
      rtoRate: "RTO রেট",
      codCollected: "COD সংগ্রহ",
    },
  },
};
