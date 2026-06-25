// Bangla mirror of en/admin/marketing.ts.
import type { marketing as En } from "../../en/admin/marketing";

export const marketing: typeof En = {
  title: "মার্কেটিং",
  subtitle: "SMS ব্রডকাস্ট",

  history: {
    heading: "ক্যাম্পেইন ইতিহাস",
    empty: "এখনো কোনো ক্যাম্পেইন নেই।",
    audienceAll: "সব গ্রাহক",
    audienceRepeat: "রিপিট গ্রাহক",
    sentPrefix: "পাঠানো",
    draft: "খসড়া",
  },

  composer: {
    recipientsLabel: "প্রাপক",
    audienceAll: "সব গ্রাহক",
    audienceRepeat: "রিপিট গ্রাহক",
    messagePlaceholder: "আপনার অফার / মেসেজ লিখুন…",
    recipientsSuffix: "জন প্রাপক",
    charsRemainingSuffix: "অক্ষর বাকি",
    emptyMessage: "মেসেজ লিখুন।",
    createFailed: "তৈরি ব্যর্থ।",
    sendFailed: "পাঠানো ব্যর্থ।",
    sentLive: "{count} জনকে SMS পাঠানো হয়েছে।",
    sentRecorded: "{count} জন রেকর্ড হয়েছে (লাইভ SMS বন্ধ — SMS_LIVE=1 দিলে আসল পাঠানো হবে)।",
    sending: "পাঠানো হচ্ছে…",
    sendButton: "পাঠান",
  },
};
