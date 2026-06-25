import type { auth as En } from "../en/auth";

// Bangla mirror of en/auth.ts — same keys/shape, exact existing Bengali strings.
export const auth: typeof En = {
  login: {
    metaTitle: "লগ ইন — Hybrid",
    heading: "আপনার অ্যাকাউন্টে লগ ইন করুন।",
    emailLabel: "ইমেইল",
    passwordLabel: "পাসওয়ার্ড",
    submit: "লগ ইন",
    submitting: "লগ ইন হচ্ছে…",
    invalidCredentials: "ইমেইল বা পাসওয়ার্ড সঠিক নয়।",
    genericError: "দুঃখিত, কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।",
  },

  signup: {
    metaTitle: "দোকান খুলুন — Hybrid",
    metaDescription: "মিনিটেই আপনার অনলাইন দোকান চালু করুন। ১৪ দিন ফ্রি ট্রায়াল।",
    railHeading: "আজই শুরু করুন। বিক্রি শুরু হোক আগামীকাল থেকে।",
    railLead:
      "ফেসবুক পেজ থেকে সত্যিকারের শপে — সাবডোমেইনে লাইভ স্টোরফ্রন্ট, ক্যাশ অন ডেলিভারি, bKash আর কুরিয়ার, সব বাংলায়।",
    railPointLiveStore: "মিনিটেই নিজের ঠিকানায় লাইভ দোকান",
    railPointCourier: "স্টেডফাস্ট কুরিয়ারে এক ক্লিকে পার্সেল বুকিং",
    railPointPayments: "ক্যাশ অন ডেলিভারি ও bKash — নিরাপদ পেমেন্ট",
    formHeading: "আপনার দোকান তৈরি করুন",
    formSubtitle: "কোনো কার্ড লাগবে না। ১৪ দিনের ফ্রি ট্রায়াল।",
    storeNameLabel: "দোকানের নাম",
    storeNameHint: "যেমন: রহিমের ফ্যাশন হাউস",
    storeAddressLabel: "আপনার স্টোরের ঠিকানা",
    storeAddressHint:
      "এই ঠিকানায় আপনার দোকান সবাই দেখতে পাবে। পরে কাস্টম ডোমেইন যুক্ত করা যাবে।",
    suggestionsLabel: "এগুলো খালি আছে:",
    emailLabel: "ইমেইল ঠিকানা",
    submit: "আমার দোকান তৈরি করুন",
    submitting: "তৈরি হচ্ছে…",
    trialNote: "শুরু করলে আপনি ১৪ দিনের ফ্রি ট্রায়াল পাচ্ছেন — কোনো কার্ড লাগবে না।",
  },

  storeNotFound: {
    heading: "স্টোরটি খুঁজে পাওয়া যায়নি",
    body: "এই ঠিকানায় কোনো সচল স্টোর নেই। লিংকটি আবার দেখে নিন, অথবা নিজের স্টোর খুলুন।",
    cta: "Hybrid-এ স্টোর খুলুন",
  },
};
