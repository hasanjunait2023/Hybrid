// Bangla mirror of en/admin/settingsGeneral.ts.
import type { settingsGeneral as En } from "../../en/admin/settingsGeneral";

export const settingsGeneral: typeof En = {
  title: "সেটিংস",

  sections: {
    payments: { label: "পেমেন্ট", sub: "বিকাশ, নগদ, SSLCommerz, COD" },
    courier: { label: "কুরিয়ার", sub: "Steadfast, Pathao" },
    notifications: { label: "নোটিফিকেশন", sub: "SMS সংযোগ" },
    dbid: { label: "DBID যাচাইকরণ", sub: "বাংলাদেশ ডিজিটাল ব্যবসা আইডি" },
    domains: { label: "কাস্টম ডোমেইন", sub: "নিজের ডোমেইন যোগ করুন" },
    analytics: { label: "অ্যানালিটিক্স", sub: "GA4, Meta Pixel/CAPI" },
    store: { label: "স্টোর প্রোফাইল", sub: "নাম, ফোন, ঠিকানা, পলিসি" },
    staff: { label: "স্টাফ ও ভূমিকা", sub: "সদস্য, মালিক/অ্যাডমিন/স্টাফ" },
    loyalty: { label: "লয়্যালটি পয়েন্ট", sub: "আর্ন রেট, রিডিম মূল্য" },
  },

  mode: {
    label: "মোড",
    sandbox: "স্যান্ডবক্স",
    stage: "স্টেজ",
    live: "লাইভ",
    testWarning:
      "মোড — পরীক্ষার জন্য। আসল পেমেন্ট/ডেলিভারির জন্য লাইভ মোডে আসল তথ্য দিন।",
  },

  store: {
    title: "স্টোর প্রোফাইল",
    storeName: "দোকানের নাম",
    subdomain: "সাবডোমেইন",
    hotline: "হটলাইন ফোন",
    facebookLink: "Facebook লিংক",
    address: "ঠিকানা",
    returnPolicy: "রিটার্ন পলিসি",
    vatBin: "VAT / BIN",
  },

  domains: {
    title: "কাস্টম ডোমেইন",
    subdomainAlwaysWorks: "আপনার সাবডোমেইন (সবসময় কাজ করবে)",
    yourDomain: "আপনার ডোমেইন",
    domainHint: "http:// বা www ছাড়া শুধু ডোমেইনটি লিখুন।",
    addFailed: "যোগ করা যায়নি।",
    adding: "যোগ হচ্ছে…",
    addDomain: "যোগ করুন",
    empty:
      "এখনো কোনো কাস্টম ডোমেইন যোগ করা হয়নি। আপনার নিজের ডোমেইন যোগ করুন (যেমন yourstore.com)।",
    primary: "প্রাইমারি",
    operationFailed: "অপারেশন ব্যর্থ।",
    dnsInstruction:
      "আপনার ডোমেইন প্রোভাইডারে (যেমন GoDaddy / Namecheap) নিচের রেকর্ডগুলো যোগ করুন।",
    caaNote: "CAA রেকর্ড থাকলে",
    caaNoteSuffix: "যোগ করুন — নাহলে SSL আসবে না।",
    dnsPropagation:
      "DNS পরিবর্তন ছড়াতে কয়েক ঘণ্টা (কখনো ৪৮ ঘণ্টা পর্যন্ত) লাগতে পারে — এটা স্বাভাবিক। আমরা নিজে থেকে চেক করতে থাকব।",
    retry: "আবার চেষ্টা করুন",
    checking: "চেক হচ্ছে…",
    checkStatus: "স্ট্যাটাস চেক করুন",
    makePrimary: "প্রাইমারি করুন",
    remove: "সরান",
    state: {
      pendingDns: "DNS-এর অপেক্ষায়",
      dnsVerified: "DNS মিলেছে · SSL তৈরি হচ্ছে",
      dnsVerifiedSub: "🔒 সার্টিফিকেট আসছে (২–১০ মিনিট)",
      sslIssued: "✓ লাইভ · নিরাপদ (HTTPS)",
      failed: "সংযোগ ব্যর্থ",
    },
  },

  loyalty: {
    title: "লয়্যালটি পয়েন্ট",
    subtitle: "রিপিট ক্রেতাদের পুরস্কার দিন",
    enable: "লয়্যালটি প্রোগ্রাম চালু করুন",
    pointsPer100: "প্রতি ১০০৳-এ পয়েন্ট",
    takaPerPoint: "১ পয়েন্ট = কত টাকা",
    saveFailed: "সংরক্ষণ ব্যর্থ।",
    saved: "সংরক্ষিত হয়েছে।",
    example: "উদাহরণ: ১০০০৳ অর্ডারে গ্রাহক পাবে",
    examplePointsUnit: "পয়েন্ট,",
    exampleWorth: "যার মূল্য",
    exampleEnd: "।",
    save: "সংরক্ষণ করুন",
  },
};
