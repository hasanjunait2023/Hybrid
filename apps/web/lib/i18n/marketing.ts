// Marketing landing copy dictionary (EN / BN). Bangla is the DEFAULT locale.
//
// Every user-facing string on the marketing page lives here keyed by locale —
// no hardcoded copy in JSX. The page resolves the locale server-side from the
// `hybrid_lang` cookie and passes the matching message object down as props, so
// SSR renders the correct language with no hydration flash.

export type Locale = "en" | "bn";

export const DEFAULT_LOCALE: Locale = "bn";

export interface PricingTier {
  /** Plan code from packages/db/sql/03_seed.sql — stable identity, not shown. */
  code: "free" | "starter" | "growth" | "pro";
  name: string;
  /** Monthly price in BDT (Latin int — view layer localizes digits). */
  priceBdt: number;
  tagline: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface MarketingMessages {
  /** <html lang> + label of the OTHER language on the toggle. */
  htmlLang: string;
  langToggle: { toLabel: string; ariaLabel: string };

  /** Official brand tagline — shown in the footer lockup + hero eyebrow. */
  tagline: string;

  nav: {
    features: string;
    pricing: string;
    how: string;
    faq: string;
    cta: string;
  };

  hero: {
    badge: string;
    titleLead: string;
    titleEmphasis: string;
    subcopy: string;
    ctaPrimary: string;
    ctaSecondary: string;
    reassurance: string;
    mockupAlt: string;
  };

  partners: {
    couriersLabel: string;
    paymentsLabel: string;
  };

  features: {
    heading: string;
    subcopy: string;
    storefront: { title: string; body: string; imageAlt: string };
    payments: { title: string; body: string };
    courier: { title: string; body: string };
    admin: { title: string; body: string; imageAlt: string };
    isolation: { title: string; body: string };
  };

  how: {
    heading: string;
    subcopy: string;
    steps: { n: string; title: string; body: string }[];
  };

  testimonials: {
    heading: string;
    subcopy: string;
    items: { quote: string; name: string; business: string; avatarAlt: string }[];
  };

  pricing: {
    heading: string;
    subcopy: string;
    perMonth: string;
    tiers: PricingTier[];
    popularLabel: string;
    note: string;
  };

  faq: {
    heading: string;
    subcopy: string;
    items: FaqItem[];
  };

  closing: {
    heading: string;
    subcopy: string;
    cta: string;
  };

  footer: {
    tagline: string;
    contactLabel: string;
    contact: string;
    madeFor: string;
    langNote: string;
    rights: string;
  };
}

const en: MarketingMessages = {
  htmlLang: "en",
  langToggle: { toLabel: "বাংলা", ariaLabel: "Switch language to Bangla" },

  tagline: "Powering your online business",

  nav: {
    features: "Features",
    pricing: "Pricing",
    how: "How it works",
    faq: "FAQ",
    cta: "Start free",
  },

  hero: {
    badge: "Cash on Delivery ready",
    titleLead: "From a Facebook page to",
    titleEmphasis: "a real online store",
    subcopy:
      "A live storefront on your own address, Cash on Delivery, bKash and Nagad, and one-tap courier booking — everything in one place, built for Bangladesh.",
    ctaPrimary: "Start free trial",
    ctaSecondary: "See how it works",
    reassurance: "14-day free trial · No card required",
    mockupAlt: "Hybrid storefront on a phone showing products and a Cash on Delivery badge",
  },

  partners: {
    couriersLabel: "Couriers",
    paymentsLabel: "Payments",
  },

  features: {
    heading: "Everything a store needs",
    subcopy: "Not five separate tools — orders, payments and delivery in one place.",
    storefront: {
      title: "A live storefront on your own address",
      body: "A mobile-first Bangla store on your own subdomain. Add products, drop in photos, go live in minutes. Connect a custom domain whenever you're ready.",
      imageAlt: "A Hybrid seller storefront shown on a phone",
    },
    payments: {
      title: "bKash, Nagad & Cash on Delivery",
      body: "Let customers pay the way they trust — bKash, Nagad or cash in hand.",
    },
    courier: {
      title: "One-tap courier booking",
      body: "Book parcels straight into Bangladesh's courier network, Steadfast and more.",
    },
    admin: {
      title: "A full Bangla admin on your phone",
      body: "Manage orders, stock and customers in your own language — right from your phone.",
      imageAlt: "The Hybrid admin dashboard in Bangla on a phone",
    },
    isolation: {
      title: "Secure and isolated",
      body: "Every store's data is separate and protected — your data stays yours alone.",
    },
  },

  how: {
    heading: "Start in three steps",
    subcopy: "From signup to your first shipped order.",
    steps: [
      { n: "1", title: "Open your store", body: "Give it a name and an address — your store is live in minutes." },
      { n: "2", title: "Add your products", body: "Photos, prices and descriptions — all from your phone." },
      { n: "3", title: "Take orders & ship", body: "Customers order, you book the courier in one tap." },
    ],
  },

  testimonials: {
    heading: "Sellers across Bangladesh",
    subcopy: "Real shops running on Hybrid every day.",
    items: [
      {
        quote: "I moved from a Facebook page to my own store in an afternoon. COD orders just work now.",
        name: "Rahima Akter",
        business: "Rahima's Fashion, Dhaka",
        avatarAlt: "Rahima Akter, owner of Rahima's Fashion",
      },
      {
        quote: "Booking couriers used to eat my whole morning. Now it's one tap and done.",
        name: "Shahin Alam",
        business: "Alam Electronics, Chattogram",
        avatarAlt: "Shahin Alam, owner of Alam Electronics",
      },
      {
        quote: "The admin is fully in Bangla, so my whole team can run orders without me.",
        name: "Nusrat Jahan",
        business: "Nokshi Ghor, Sylhet",
        avatarAlt: "Nusrat Jahan, owner of Nokshi Ghor",
      },
    ],
  },

  pricing: {
    heading: "Simple, honest pricing",
    subcopy: "Start free. Upgrade when you grow.",
    perMonth: "/month",
    popularLabel: "Most popular",
    note: "All plans include the live storefront, COD, bKash and courier booking. Prices in BDT, billed monthly.",
    tiers: [
      {
        code: "free",
        name: "Free",
        priceBdt: 0,
        tagline: "Try it with no risk",
        features: ["50 products", "100 orders / month", "Subdomain store", "1 staff account"],
        cta: "Start free",
      },
      {
        code: "starter",
        name: "Starter",
        priceBdt: 799,
        tagline: "For a growing shop",
        features: ["500 products", "1,000 orders / month", "1 custom domain", "3 staff accounts"],
        cta: "Start free",
      },
      {
        code: "growth",
        name: "Growth",
        priceBdt: 2499,
        tagline: "For busy stores",
        features: ["5,000 products", "10,000 orders / month", "3 custom domains", "8 staff accounts"],
        cta: "Start free",
        popular: true,
      },
      {
        code: "pro",
        name: "Pro",
        priceBdt: 4999,
        tagline: "For scaling brands",
        features: ["Unlimited products", "Unlimited orders", "10 custom domains", "25 staff accounts"],
        cta: "Start free",
      },
    ],
  },

  faq: {
    heading: "Questions, answered",
    subcopy: "Everything you need to know before you start.",
    items: [
      {
        q: "Is it really free to start?",
        a: "Yes. The Free plan is free forever, and every paid plan starts with a 14-day free trial — no card required.",
      },
      {
        q: "Do I need any technical skills?",
        a: "No. If you can run a Facebook page, you can run a Hybrid store. Everything is in Bangla and works from your phone.",
      },
      {
        q: "How do payments and Cash on Delivery work?",
        a: "Customers pay with bKash, Nagad or Cash on Delivery. COD is on by default — collect cash when the parcel is delivered.",
      },
      {
        q: "Can I use my own domain?",
        a: "Yes. Start on a free subdomain like rahim.myhybrid.com, then connect your own custom domain on a paid plan.",
      },
      {
        q: "Is my data safe?",
        a: "Every store's data is fully isolated and protected at the database layer. Your customers and orders are visible only to you.",
      },
    ],
  },

  closing: {
    heading: "Open your online store today",
    subcopy: "14 days free — no card required.",
    cta: "Start free",
  },

  footer: {
    tagline: "Commerce, built for Bangladesh.",
    contactLabel: "Contact",
    contact: "hello@myhybrid.com",
    madeFor: "Made for Bangladesh's sellers",
    langNote: "Available in Bangla and English",
    rights: "All rights reserved.",
  },
};

const bn: MarketingMessages = {
  htmlLang: "bn",
  langToggle: { toLabel: "EN", ariaLabel: "ভাষা ইংরেজিতে পরিবর্তন করুন" },

  tagline: "আপনার অনলাইন ব্যবসার চালিকাশক্তি",

  nav: {
    features: "যা যা পাবেন",
    pricing: "মূল্য",
    how: "কীভাবে কাজ করে",
    faq: "জিজ্ঞাসা",
    cta: "ফ্রি শুরু করুন",
  },

  hero: {
    badge: "ক্যাশ অন ডেলিভারি রেডি",
    titleLead: "ফেসবুক পেজ থেকে",
    titleEmphasis: "সত্যিকারের অনলাইন দোকান",
    subcopy:
      "নিজের ঠিকানায় লাইভ স্টোরফ্রন্ট, ক্যাশ অন ডেলিভারি, bKash ও নগদ, আর এক ক্লিকে কুরিয়ার বুকিং — সবকিছু এক জায়গায়, বাংলাদেশের জন্য তৈরি।",
    ctaPrimary: "বিনামূল্যে শুরু করুন",
    ctaSecondary: "কীভাবে কাজ করে দেখুন",
    reassurance: "১৪ দিন ফ্রি ট্রায়াল · কার্ড লাগবে না",
    mockupAlt: "মোবাইলে হাইব্রিড স্টোরফ্রন্ট — পণ্য ও ক্যাশ অন ডেলিভারি ব্যাজসহ",
  },

  partners: {
    couriersLabel: "কুরিয়ার",
    paymentsLabel: "পেমেন্ট",
  },

  features: {
    heading: "একটা দোকান চালাতে যা যা লাগে",
    subcopy: "আলাদা আলাদা টুল নয় — অর্ডার, পেমেন্ট, ডেলিভারি সব এক জায়গায়।",
    storefront: {
      title: "নিজের ঠিকানায় লাইভ স্টোরফ্রন্ট",
      body: "নিজের সাবডোমেইনে মোবাইল-ফার্স্ট বাংলা দোকান। পণ্য যোগ করুন, ছবি দিন, মিনিটেই লাইভ। চাইলে পরে নিজের কাস্টম ডোমেইনও যুক্ত করুন।",
      imageAlt: "মোবাইলে একজন বিক্রেতার হাইব্রিড স্টোরফ্রন্ট",
    },
    payments: {
      title: "bKash, নগদ ও ক্যাশ অন ডেলিভারি",
      body: "গ্রাহক যেভাবে স্বচ্ছন্দ, সেভাবেই পেমেন্ট — bKash, নগদ বা হাতে হাতে।",
    },
    courier: {
      title: "এক ক্লিকে কুরিয়ার বুকিং",
      body: "স্টেডফাস্টসহ দেশের কুরিয়ার নেটওয়ার্কে সরাসরি পার্সেল বুক করুন।",
    },
    admin: {
      title: "পুরো অ্যাডমিন বাংলায়, মোবাইলেই",
      body: "অর্ডার, স্টক, গ্রাহক — সবকিছু পরিচালনা করুন আপনার ভাষায়, মোবাইল থেকেই।",
      imageAlt: "মোবাইলে বাংলায় হাইব্রিড অ্যাডমিন ড্যাশবোর্ড",
    },
    isolation: {
      title: "নিরাপদ ও সুরক্ষিত",
      body: "প্রতিটি দোকানের তথ্য আলাদা ও সুরক্ষিত — আপনার ডেটা শুধু আপনারই।",
    },
  },

  how: {
    heading: "তিন ধাপে শুরু",
    subcopy: "সাইন-আপ থেকে প্রথম অর্ডার ডেলিভারি পর্যন্ত।",
    steps: [
      { n: "১", title: "দোকান খুলুন", body: "নাম আর ঠিকানা দিন — মিনিটেই আপনার দোকান লাইভ।" },
      { n: "২", title: "পণ্য যোগ করুন", body: "ছবি, দাম আর বিবরণ — সবকিছু মোবাইল থেকেই।" },
      { n: "৩", title: "অর্ডার নিন, ডেলিভারি দিন", body: "গ্রাহক অর্ডার করুক, আপনি এক ক্লিকে কুরিয়ারে বুক করুন।" },
    ],
  },

  testimonials: {
    heading: "সারাদেশের বিক্রেতারা",
    subcopy: "প্রতিদিন হাইব্রিডে চলছে অসংখ্য দোকান।",
    items: [
      {
        quote: "এক বিকেলেই ফেসবুক পেজ থেকে নিজের দোকানে চলে এসেছি। এখন ক্যাশ অন ডেলিভারি অর্ডার সহজেই হয়।",
        name: "রহিমা আক্তার",
        business: "রহিমা’স ফ্যাশন, ঢাকা",
        avatarAlt: "রহিমা আক্তার, রহিমা’স ফ্যাশনের মালিক",
      },
      {
        quote: "আগে কুরিয়ার বুক করতেই সকাল পার হয়ে যেত। এখন এক ক্লিকেই শেষ।",
        name: "শাহিন আলম",
        business: "আলম ইলেকট্রনিক্স, চট্টগ্রাম",
        avatarAlt: "শাহিন আলম, আলম ইলেকট্রনিক্সের মালিক",
      },
      {
        quote: "অ্যাডমিন পুরো বাংলায়, তাই আমার পুরো টিম নিজেই অর্ডার সামলাতে পারে।",
        name: "নুসরাত জাহান",
        business: "নকশি ঘর, সিলেট",
        avatarAlt: "নুসরাত জাহান, নকশি ঘরের মালিক",
      },
    ],
  },

  pricing: {
    heading: "সহজ ও স্বচ্ছ মূল্য",
    subcopy: "ফ্রি শুরু করুন। বড় হলে আপগ্রেড করুন।",
    perMonth: "/মাস",
    popularLabel: "সবচেয়ে জনপ্রিয়",
    note: "সব প্ল্যানেই থাকছে লাইভ স্টোরফ্রন্ট, ক্যাশ অন ডেলিভারি, bKash ও কুরিয়ার বুকিং। মূল্য টাকায়, মাসিক বিল।",
    tiers: [
      {
        code: "free",
        name: "ফ্রি",
        priceBdt: 0,
        tagline: "ঝুঁকি ছাড়াই দেখে নিন",
        features: ["৫০টি পণ্য", "মাসে ১০০ অর্ডার", "সাবডোমেইন দোকান", "১টি স্টাফ"],
        cta: "ফ্রি শুরু করুন",
      },
      {
        code: "starter",
        name: "স্টার্টার",
        priceBdt: 799,
        tagline: "বাড়ন্ত দোকানের জন্য",
        features: ["৫০০টি পণ্য", "মাসে ১,০০০ অর্ডার", "১টি কাস্টম ডোমেইন", "৩টি স্টাফ"],
        cta: "ফ্রি শুরু করুন",
      },
      {
        code: "growth",
        name: "গ্রোথ",
        priceBdt: 2499,
        tagline: "ব্যস্ত দোকানের জন্য",
        features: ["৫,০০০টি পণ্য", "মাসে ১০,০০০ অর্ডার", "৩টি কাস্টম ডোমেইন", "৮টি স্টাফ"],
        cta: "ফ্রি শুরু করুন",
        popular: true,
      },
      {
        code: "pro",
        name: "প্রো",
        priceBdt: 4999,
        tagline: "বড় ব্র্যান্ডের জন্য",
        features: ["আনলিমিটেড পণ্য", "আনলিমিটেড অর্ডার", "১০টি কাস্টম ডোমেইন", "২৫টি স্টাফ"],
        cta: "ফ্রি শুরু করুন",
      },
    ],
  },

  faq: {
    heading: "প্রশ্নের উত্তর",
    subcopy: "শুরুর আগে যা জানা দরকার।",
    items: [
      {
        q: "শুরু করতে কি সত্যিই ফ্রি?",
        a: "হ্যাঁ। ফ্রি প্ল্যান চিরকাল ফ্রি, আর প্রতিটি পেইড প্ল্যানে থাকে ১৪ দিনের ফ্রি ট্রায়াল — কোনো কার্ড লাগবে না।",
      },
      {
        q: "টেকনিক্যাল দক্ষতা কি লাগবে?",
        a: "না। ফেসবুক পেজ চালাতে পারলে হাইব্রিড দোকানও চালাতে পারবেন। সবকিছু বাংলায় এবং মোবাইল থেকেই চলে।",
      },
      {
        q: "পেমেন্ট ও ক্যাশ অন ডেলিভারি কীভাবে কাজ করে?",
        a: "গ্রাহক bKash, নগদ বা ক্যাশ অন ডেলিভারিতে পেমেন্ট করেন। ক্যাশ অন ডেলিভারি ডিফল্টে চালু — পার্সেল পৌঁছালে টাকা সংগ্রহ করুন।",
      },
      {
        q: "নিজের ডোমেইন ব্যবহার করা যাবে?",
        a: "হ্যাঁ। rahim.myhybrid.com এর মতো ফ্রি সাবডোমেইনে শুরু করুন, পেইড প্ল্যানে নিজের কাস্টম ডোমেইন যুক্ত করুন।",
      },
      {
        q: "আমার ডেটা কি নিরাপদ?",
        a: "প্রতিটি দোকানের তথ্য ডেটাবেস স্তরেই আলাদা ও সুরক্ষিত। আপনার গ্রাহক ও অর্ডার শুধু আপনিই দেখতে পান।",
      },
    ],
  },

  closing: {
    heading: "আজই খুলুন আপনার অনলাইন দোকান",
    subcopy: "১৪ দিন ফ্রি — কোনো কার্ড লাগবে না।",
    cta: "ফ্রি শুরু করুন",
  },

  footer: {
    tagline: "বাংলাদেশের জন্য তৈরি কমার্স।",
    contactLabel: "যোগাযোগ",
    contact: "hello@myhybrid.com",
    madeFor: "বাংলাদেশের সেলারদের জন্য তৈরি",
    langNote: "বাংলা ও ইংরেজিতে উপলব্ধ",
    rights: "সর্বস্বত্ব সংরক্ষিত।",
  },
};

const MESSAGES: Record<Locale, MarketingMessages> = { en, bn };

/** Resolve the typed message dictionary for a locale. */
export function getMessages(locale: Locale): MarketingMessages {
  return MESSAGES[locale];
}
