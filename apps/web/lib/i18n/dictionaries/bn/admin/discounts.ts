// Bangla mirror of en/admin/discounts.ts.
import type { discounts as En } from "../../en/admin/discounts";

export const discounts: typeof En = {
  title: "ডিসকাউন্ট",
  countSuffix: "টি ডিসকাউন্ট",
  newDiscount: "নতুন ডিসকাউন্ট",
  empty: "কোনো ডিসকাউন্ট নেই।",

  describe: {
    percentOff: "% ছাড়",
    fixedOffPrefix: "৳",
    fixedOffSuffix: "ছাড়",
    freeShipping: "ফ্রি ডেলিভারি",
  },

  status: {
    active: "সক্রিয়",
    scheduled: "নির্ধারিত",
    disabled: "বন্ধ",
    expired: "মেয়াদোত্তীর্ণ",
  },

  form: {
    backToDiscounts: "ডিসকাউন্ট",
    newDiscount: "নতুন ডিসকাউন্ট",
    code: "কোড",
    titleOptional: "শিরোনাম (ঐচ্ছিক)",
    type: "ধরন",
    typePercentage: "শতকরা (%)",
    typeFixed: "নির্দিষ্ট (৳)",
    typeFreeShipping: "ফ্রি ডেলিভারি",
    percentValue: "শতকরা মান (%)",
    fixedValue: "ছাড়ের পরিমাণ (৳)",
    minCart: "ন্যূনতম কার্ট মূল্য (৳)",
    totalUsageLimit: "মোট ব্যবহার সীমা",
    perCustomerLimit: "প্রতি গ্রাহক সীমা",
    unlimited: "সীমাহীন",
    starts: "শুরু",
    ends: "শেষ",
    statusLabel: "অবস্থা",
    saving: "সেভ হচ্ছে…",
    save: "সেভ করুন",
    createDiscount: "ডিসকাউন্ট তৈরি করুন",
    delete: "মুছুন",
    saveFailed: "সেভ ব্যর্থ হয়েছে।",
  },
};
