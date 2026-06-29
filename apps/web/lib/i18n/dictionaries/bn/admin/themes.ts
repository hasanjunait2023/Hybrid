import type { themes as En } from "../../en/admin/themes";

// Bangla mirror of en/admin/themes.ts — same keys/shape, Bangla values.
export const themes: typeof En = {
  title: "থিম ও ডিজাইন",
  subtitle: "একটি থিম বাছুন, তারপর রং, ফন্ট ও কন্টেন্ট কাস্টমাইজ করুন।",

  catalog: {
    activateFailed: "থিম চালু করা যায়নি।",
    category: {
      general: "সাধারণ",
      fashion: "ফ্যাশন",
      electronics: "ইলেকট্রনিক্স",
    },
    preview: "প্রিভিউ",
    customize: "কাস্টমাইজ করুন",
    activate: "এই থিম চালু করুন",
    currentTheme: "বর্তমান থিম",
    confirm: {
      title: "{theme} থিম চালু করবেন?",
      body: "নতুন থিমে আপনার রং আর হিরো আবার দেখে নিন — থিমগুলোর গঠন আলাদা, তাই কিছু কাস্টমাইজেশন আবার ঠিক করতে হতে পারে। এটি এখনই লাইভ স্টোরে যাবে না; আপনি কাস্টমাইজ করে তারপর প্রকাশ করবেন।",
      cancel: "বাতিল",
      activating: "চালু হচ্ছে…",
      activate: "চালু করুন",
    },
  },

  customizer: {
    heading: "কাস্টমাইজ",
    groups: {
      colors: "রং",
      typography: "ফন্ট",
      content: "কন্টেন্ট",
      sections: "সেকশন",
      builder: "পেজ বিল্ডার",
    },
    publish: "প্রকাশ করুন",
    customizeButton: "কাস্টমাইজ করুন",
    controlsLabel: "কাস্টমাইজ কন্ট্রোল",
    closeSheet: "বন্ধ করুন",
    sheetClose: "বন্ধ",
    publishFailed: "প্রকাশ করা যায়নি।",
    status: {
      saving: "সেভ হচ্ছে…",
      saveError: "সেভ হয়নি — আবার চেষ্টা",
      draft: "খসড়া · অপ্রকাশিত পরিবর্তন আছে",
      published: "প্রকাশিত · সব সেভ",
    },
    device: {
      mobile: "📱 ৩৬০",
      desktop: "💻 ১২৮০",
    },
    preview: {
      title: "স্টোর প্রিভিউ",
      unavailable: "প্রিভিউ পাওয়া যাচ্ছে না।",
    },
    publishConfirm: {
      title: "প্রকাশ করবেন?",
      body: "এই পরিবর্তনগুলো লাইভ স্টোরে দেখা যাবে।",
      cancel: "বাতিল",
      publishing: "প্রকাশ হচ্ছে…",
      publish: "প্রকাশ করুন",
    },
  },

  colors: {
    presetLabel: "প্রিসেট",
    fields: {
      primary: "প্রাইমারি (বাটন)",
      accent: "অ্যাকসেন্ট (সেল ট্যাগ)",
      background: "ব্যাকগ্রাউন্ড",
      surface: "কার্ড/সারফেস",
      text: "লেখার রং",
    },
    presets: {
      dorejaClassic: "দরজা ক্লাসিক",
      green: "সবুজ",
      blueGold: "নীল-সোনা",
    },
    contrastWarning:
      "⚠ লেখা ও ব্যাকগ্রাউন্ডের কনট্রাস্ট কম ({ratio}:১) — পড়তে কষ্ট হতে পারে।",
  },

  typography: {
    headingFont: "হেডিং ফন্ট",
    bodyFont: "বডি ফন্ট",
    sampleText: "আপনার দোকান",
  },

  content: {
    storeName: "দোকানের নাম",
    logoUrl: "লোগো URL",
    heroSection: "হিরো সেকশন",
    headline: "হেডলাইন",
    headlineHint: "{count} অক্ষর বাকি",
    subline: "সাবলাইন",
    ctaText: "বাটনের লেখা",
    heroImageUrl: "হিরো ছবির URL",
    featuredCollection: "ফিচার্ড কালেকশন",
    none: "— কোনোটি নয় —",
  },

  sections: {
    hint: "সেকশন চালু/বন্ধ করুন আর ক্রম বদলান। নতুন সেকশন যোগ করা যায় না।",
    trustWarning: "COD ট্রাস্ট সেকশন বন্ধ করলে বিশ্বাসযোগ্যতা কমে।",
    labels: {
      announcement_bar: "ঘোষণা বার",
      hero: "হিরো ব্যানার",
      featured_products: "ফিচার্ড পণ্য",
      collections_grid: "কালেকশন গ্রিড",
      trust_band: "ট্রাস্ট সেকশন (COD)",
    },
  },
};
