// Bangla mirror of en/admin/journeys.ts.
import type { journeys as En } from "../../en/admin/journeys";

export const journeys: typeof En = {
  title: "অটোমেশন",
  subtitle: "সঠিক সময়ে গ্রাহককে স্বয়ংক্রিয় মেসেজ — একবার সেট করুন, নিজেই চলবে।",

  trigger: {
    review_request: "রিভিউ অনুরোধ (ডেলিভারির পর)",
    win_back: "ফিরিয়ে আনা (নিষ্ক্রিয় গ্রাহক)",
    repeat_buyer: "রিপিট গ্রাহককে ধন্যবাদ",
  },
  triggerShort: {
    review_request: "রিভিউ অনুরোধ",
    win_back: "ফিরিয়ে আনা",
    repeat_buyer: "রিপিট গ্রাহক",
  },

  nameLabel: "নাম",
  namePlaceholder: "যেমন: রিভিউ চাওয়া",
  triggerLabel: "ট্রিগার",
  messageLabel: "মেসেজ",
  messagePlaceholder: "হ্যালো {name}, অর্ডারের জন্য ধন্যবাদ!",
  messageHint: "গ্রাহকের নাম বসাতে {name} ব্যবহার করুন।",
  thresholdLabel: "কত দিন পর",
  thresholdHint: "রিভিউ অনুরোধ: ডেলিভারির কত দিন পর। ফিরিয়ে আনা: শেষ অর্ডারের কত দিন পর।",
  minOrdersLabel: "ন্যূনতম অর্ডার",
  minOrdersHint: "রিপিট গ্রাহক: এতগুলো অর্ডার হলে একবার পাঠানো হবে।",
  add: "অটোমেশন তৈরি করুন",
  adding: "তৈরি হচ্ছে…",
  addFailed: "অটোমেশন তৈরি করা যায়নি।",

  empty: "কোনো অটোমেশন নেই।",
  channelSms: "এসএমএস",
  active: "চালু",
  paused: "বন্ধ",
  pause: "বন্ধ করুন",
  activate: "চালু করুন",
  delete: "মুছুন",
  runsUnit: "পাঠানো হয়েছে",
  runNow: "এখন চালান",
  running: "চলছে…",
  ranResult: "{sent}টি পাঠানো, {failed}টি ব্যর্থ।",
};
