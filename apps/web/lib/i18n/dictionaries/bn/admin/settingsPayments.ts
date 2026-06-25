import type { settingsPayments as En } from "../../en/admin/settingsPayments";

// Bangla mirror of the settingsPayments namespace — same keys/shape, Bangla values.
export const settingsPayments: typeof En = {
  // Page chrome
  backToSettings: "সেটিংস",
  title: "পেমেন্ট",

  // Shared save fallbacks (used across the provider forms)
  saveFailed: "সেভ ব্যর্থ হয়েছে।",
  saving: "সেভ হচ্ছে…",
  save: "সেভ করুন",
  saved: "সেভ হয়েছে।",

  // COD card
  cod: {
    title: "ক্যাশ অন ডেলিভারি",
    subtitle: "পণ্য হাতে পেয়ে টাকা দিন — বাংলাদেশের ডিফল্ট।",
    on: "চালু",
    off: "বন্ধ",
  },

  // bKash card
  bkash: {
    title: "বিকাশ",
    callbackLabel: "Callback URL (সার্ভার-সেট, রেফারেন্সের জন্য)",
    username: "ইউজারনেম",
    password: "পাসওয়ার্ড",
  },

  // Nagad card
  nagad: {
    title: "নগদ",
    callbackLabel: "Callback URL",
    callbackWarning:
      "এই URL আপনার নগদ পোর্টালে callback হিসেবে বসান — না বসালে পেমেন্ট কনফার্ম হবে না।",
    callbackHint:
      "আগে একটি ডোমেইন ভেরিফাই করুন — তারপর সঠিক callback URL এখানে দেখা যাবে।",
  },

  // SSLCommerz card
  sslcommerz: {
    title: "SSLCommerz",
    ipnLabel: "IPN URL",
    ipnWarning:
      "এই URL আপনার SSLCommerz প্যানেলে IPN হিসেবে রেজিস্টার করুন — না করলে পেমেন্ট কনফার্ম হবে না।",
    ipnHint:
      "আগে একটি ডোমেইন ভেরিফাই করুন — তারপর সঠিক IPN URL এখানে দেখা যাবে।",
  },
};
