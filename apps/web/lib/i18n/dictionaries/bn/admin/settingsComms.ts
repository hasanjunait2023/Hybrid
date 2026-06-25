import type { settingsComms as En } from "../../en/admin/settingsComms";

// Bangla mirror of en/admin/settingsComms.ts — same keys/shape, Bangla values.
export const settingsComms: typeof En = {
  settingsLink: "সেটিংস",

  saveFailed: "সেভ ব্যর্থ হয়েছে।",

  notifications: {
    title: "নোটিফিকেশন",
    sms: {
      senderIdLabel: "sender_id (ঐচ্ছিক)",
    },
    whatsapp: {
      templateWarning:
        "⚠ অর্ডার কনফার্মেশনের বাংলা টেমপ্লেটটি Meta-তে অনুমোদিত হতে হবে (Utility template)। অনুমোদন না হওয়া পর্যন্ত মেসেজ পাঠানো যাবে না।",
      phoneNumberIdLabel: "ফোন নম্বর ID",
      accessTokenLabel: "অ্যাক্সেস টোকেন",
    },
  },

  analytics: {
    title: "অ্যানালিটিক্স",
    cardTitle: "অ্যানালিটিক্স (GA4 + Meta Pixel)",
    intro:
      "Google Analytics 4 ও Meta (Facebook) Pixel/Conversions API যুক্ত করুন। অর্ডার সম্পন্ন হলে Purchase ইভেন্ট একবারই গণনা হয় (ডুপ্লিকেট বাদ)।",
    testEventCodeLabel: "Meta Test Event Code (ঐচ্ছিক)",
  },

  courier: {
    title: "কুরিয়ার",
    steadfast: {
      noSandbox:
        "⚠ Steadfast-এর কোনো স্যান্ডবক্স নেই — লাইভ ডেলিভারির জন্য portal.steadfast.com.bd-এ আসল মার্চেন্ট অ্যাকাউন্ট লাগবে।",
    },
  },

  staff: {
    title: "স্টাফ ও ভূমিকা",
    membersUnit: "জন সদস্য",
    description:
      "মালিক ও অ্যাডমিন সদস্য যোগ/সরাতে পারেন। ভূমিকা: মালিক (সব), অ্যাডমিন (পরিচালনা), স্টাফ (দৈনিক কাজ)।",
    emailLabel: "ইমেইল",
    nameLabel: "নাম",
    roleLabel: "ভূমিকা",
    roles: {
      owner: "মালিক",
      admin: "অ্যাডমিন",
      staff: "স্টাফ",
    },
    youSuffix: " · আপনি",
    addMember: "যোগ করুন",
    failed: "ব্যর্থ হয়েছে।",
  },
};
