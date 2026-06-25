import type { reviews as En } from "../../en/admin/reviews";

// Bangla mirror — same keys/shape, Bangla string values.
export const reviews: typeof En = {
  title: "রিভিউ",
  pendingSuffix: "অপেক্ষমাণ",
  empty: "কোনো রিভিউ নেই।",
  customerFallback: "গ্রাহক",

  stat: {
    pending: "অপেক্ষমাণ",
    approved: "অনুমোদিত",
    avgRating: "গড় রেটিং",
    total: "মোট",
  },

  status: {
    pending: "অপেক্ষমাণ",
    approved: "অনুমোদিত",
    rejected: "বাতিল",
  },

  action: {
    approve: "অনুমোদন",
    reject: "বাতিল",
  },
};
