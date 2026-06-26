// Bangla mirror of en/admin/shipping.ts.
import type { shipping as En } from "../../en/admin/shipping";

export const shipping: typeof En = {
  title: "শিপিং ও ডেলিভারি",
  subtitle: "অরিজিন অবস্থান এবং ওজন-ভিত্তিক ডেলিভারি রেট",

  enabledLabel: "শিপিং হিসাব চালু করুন",
  hint: "রেট ওজন-ভিত্তিক: চার্জ = বেস + প্রতি-কেজি × বিলযোগ্য ওজন (ঊর্ধ্বমুখী রাউন্ড, ন্যূনতম ১ কেজি)।",

  origin: {
    division: "অরিজিন বিভাগ",
    district: "অরিজিন জেলা",
    placeholder: "যেমন ঢাকা",
  },

  freeAbove: "এর বেশি হলে ফ্রি শিপিং (৳)",
  freeAbovePlaceholder: "বন্ধ রাখতে খালি রাখুন",
  defaultRate: "ডিফল্ট রেট (৳)",

  zones: {
    sameDistrict: "একই জেলা",
    sameDivision: "একই বিভাগ",
    otherDivision: "অন্য বিভাগ",
  },

  base: "বেস (৳)",
  perKg: "প্রতি কেজি (৳)",

  save: "সংরক্ষণ করুন",
  saved: "সংরক্ষিত হয়েছে।",
  saveFailed: "সংরক্ষণ ব্যর্থ হয়েছে।",
};
