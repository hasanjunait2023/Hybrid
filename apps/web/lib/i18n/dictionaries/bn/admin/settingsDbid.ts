import type { settingsDbid as En } from "../../en/admin/settingsDbid";

// Bangla mirror of en/admin/settingsDbid.ts — same keys/shape, Bangla values.
// Wizard text intentionally mirrors the gov.bd DBID portal vocabulary so
// sellers moving from the gov site feel at home.
export const settingsDbid: typeof En = {
  settingsLink: "সেটিংস",

  title: "ডিজিটাল ব্যবসা আইডি (DBID) যাচাইকরণ",
  intro:
    "বাংলাদেশে ই-কমার্সের জন্য ডিজিটাল ব্যবসা আইডি (DBID) বাধ্যতামূলক। নিচের ৪টি ধাপ পূরণ করুন, আমরা আপনার পক্ষে জমা দেব। আপনার কাগজপত্র সিল থাকবে এবং শুধু DBID-এর সাথে শেয়ার হবে।",

  status: {
    not_started: "শুরু হয়নি",
    in_progress: "চলমান",
    submitted: "জমা হয়েছে — পর্যালোচনার অপেক্ষায়",
    approved: "অনুমোদিত ✓",
    rejected: "প্রত্যাখ্যাত — নোট দেখুন",
  },

  step1: {
    title: "ব্যবসার পরিচয়",
    hint:
      "ব্যবসার নাম হুবহু ট্রেড লাইসেন্সে যেমন আছে সেইভাবে লিখুন। মালিকের নাম ২য় ধাপে দেওয়া NID-র সাথে মিলতে হবে।",
    businessNameLabel: "ব্যবসার নাম",
    businessNamePlaceholder: "যেমন: করিম ইলেকট্রনিক্স",
    businessTypeLabel: "ব্যবসার ধরন",
    businessTypes: {
      proprietorship: "একক মালিকানা (Proprietorship)",
      partnership: "অংশীদারি (Partnership)",
      ltd: "লিমিটেড কোম্পানি",
    },
    ownerFullNameLabel: "মালিকের পূর্ণ নাম",
    ownerFullNamePlaceholder: "NID-তে যেভাবে আছে সেভাবে",
    ownerDobLabel: "মালিকের জন্ম তারিখ",
  },

  step2: {
    title: "জাতীয় পরিচয়পত্র (NID)",
    hint:
      "১০ বা ১৭ ডিজিটের বাংলাদেশি জাতীয় পরিচয়পত্র নম্বর। যাচাইয়ের জন্য আমরা শুধু শেষ ৪ ডিজিট সংরক্ষণ করি।",
    nidLabel: "NID নম্বর",
    nidPlaceholder: "১০ বা ১৭ ডিজিট",
  },

  step3: {
    title: "TIN + ট্রেড লাইসেন্স",
    hint:
      "TIN (ট্যাক্স আইডেন্টিফিকেশন নম্বর) ১২ ডিজিটের। ট্রেড লাইসেন্স আপনার সিটি কর্পোরেশন / পৌরসভা থেকে দেওয়া হয়।",
    tinLabel: "TIN নম্বর",
    tinPlaceholder: "১২ ডিজিট",
    tradeLicenseLabel: "ট্রেড লাইসেন্স নম্বর",
    tradeLicensePlaceholder: "সার্টিফিকেটে যেমন আছে",
    tradeLicenseIssuedLabel: "প্রদানের তারিখ",
    tradeLicenseExpiresLabel: "মেয়াদ শেষের তারিখ",
    binLabel: "BIN (ভ্যাট) — ঐচ্ছিক",
    binPlaceholder: "ব্যবসা শনাক্তকরণ নম্বর (ভ্যাট নিবন্ধিত হলে)",
  },

  step4: {
    title: "পর্যালোচনা ও জমা",
    hint:
      "প্রতিটি ক্ষেত্র আবার যাচাই করুন। জমার পর DBID সাধারণত ৫–১০ কার্যদিবসের মধ্যে উত্তর দেয়। অনুমোদন হলে ১৭ ডিজিটের DBID নম্বর পাবেন।",
    confirmLabel:
      "আমি নিশ্চিত করছি উপরের তথ্য সঠিক এবং আমি ব্যবসার পক্ষে জমা দেওয়ার জন্য অনুমোদিত।",
  },

  reviewNotes: "পর্যালোচকের নোট",
  dbidNumber: "DBID নম্বর",
  expiresOn: "মেয়াদ শেষ",
  submittedOn: "জমার তারিখ",

  saveFailed: "সেভ ব্যর্থ হয়েছে।",
  submitFailed: "জমা ব্যর্থ হয়েছে।",
  nextStep: "পরবর্তী ধাপ",
  previousStep: "আগের",
  saveDraft: "খসড়া সংরক্ষণ",
  submitForReview: "DBID পর্যালোচনায় জমা দিন",
  statusBadgeLabel: "DBID",
  sectionLabel: "DBID যাচাইকরণ",
  sectionSub: "বাংলাদেশ ডিজিটাল ব্যবসা আইডি — বিক্রেতাদের জন্য বাধ্যতামূলক",
};