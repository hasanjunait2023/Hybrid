import type { cod as En } from "../../en/admin/cod";

// Bangla mirror of the cod namespace — same keys/shape, Bangla values.
export const cod: typeof En = {
  // COD-pending list page (/admin/cod)
  pending: {
    title: "COD বকেয়া",
    expectedCollection: "প্রত্যাশিত সংগ্রহ",
    shipmentsUnit: "টি চালান",
    note: "ⓘ এটি কুরিয়ারের কাছে এখনো সংগ্রহ-বাকি টাকার প্রত্যাশিত হিসাব। কুরিয়ার রেমিট্যান্স মিলানো (reconciliation) পরের ধাপে আসবে।",
    empty: "কোনো COD বকেয়া নেই।",
    tracking: "ট্র্যাকিং",
  },

  // COD & Settlements page (/admin/cod/settlements)
  settlements: {
    title: "COD ও সেটেলমেন্ট",
    upload: "রেমিট্যান্স CSV আপলোড করুন",
    summary: {
      expected: "প্রত্যাশিত COD",
      collected: "সংগৃহীত",
      remitted: "জমা হয়েছে",
      discrepancyLabel: "গরমিল / বকেয়া",
    },
    emptyRows: {
      title: "এখনো কোনো COD চালান নেই",
      hint: "অর্ডার কুরিয়ারে পাঠালে এখানে দেখা যাবে; রেমিট্যান্স CSV আপলোড করে মিলিয়ে নিন।",
    },
    table: {
      shipmentOrder: "চালান / অর্ডার",
      expected: "প্রত্যাশিত",
      collected: "সংগৃহীত",
      remitted: "জমা",
      discrepancy: "Δ গরমিল",
      status: "অবস্থা",
    },
    missingRemittance: "⚠ রেমিট্যান্স পাওয়া যায়নি",
    batchesHeading: "রেমিট্যান্স ব্যাচ",
    emptyBatches: {
      title: "এখনো কোনো রেমিট্যান্স আপলোড হয়নি",
      hint: "কুরিয়ার থেকে CSV নামিয়ে আপলোড করুন।",
    },
    unmatched: "মেলেনি",
    footnote: "সব হিসাব আপনার নিজের ডেটা থেকে — Hybrid কোনো টাকা ছোঁয় না।",
  },

  // Mark-resolved action (ResolveButton)
  resolve: {
    resolved: "✓ সমাধান হয়েছে",
    confirm: "কুরিয়ারের সাথে মিটমাট হয়েছে — সমাধান চিহ্নিত করবেন?",
    button: "সমাধান হয়েছে",
    pending: "…",
  },

  // Remittance CSV upload (RemittanceUpload)
  remittance: {
    upload: "রেমিট্যান্স CSV আপলোড করুন",
    csvLabel: "CSV ফাইল",
    referenceLabel: "রেফারেন্স (ঐচ্ছিক)",
    referencePlaceholder: "ব্যাচ/ইনভয়েস আইডি",
    hint: "কলামের নাম এখনো নিশ্চিত নয় — আসল CSV-এর সাথে মিলিয়ে দেখুন। সর্বোচ্চ ৫০০ লাইন।",
    submit: "আপলোড ও মিলিয়ে নিন",
    submitting: "প্রক্রিয়া হচ্ছে…",
    matchedLines: "লাইন মিলেছে",
    unmatchedLines: "লাইন মেলেনি",
    discrepanciesFound: "টি গরমিল পাওয়া গেছে।",
  },
};
