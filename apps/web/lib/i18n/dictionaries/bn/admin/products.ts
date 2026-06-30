import type { products as En } from "../../en/admin/products";

// Bangla mirror of en/admin/products.ts — same keys/shape, Bangla values.
export const products: typeof En = {
  title: "পণ্য",
  productsUnit: "টি পণ্য",
  newProduct: "নতুন পণ্য",
  collectionsLink: "কালেকশন",
  empty: "কোনো পণ্য নেই।",

  subtitle: {
    activeSuffix: "অ্যাকটিভ",
  },

  stats: {
    total: "মোট পণ্য",
    active: "অ্যাকটিভ",
    lowStock: "কম স্টক",
    outOfStock: "স্টক শেষ",
  },

  statusPills: {
    all: "সব",
    active: "অ্যাকটিভ",
    draft: "ড্রাফট",
    archived: "আর্কাইভড",
  },

  table: {
    product: "পণ্য",
    status: "স্ট্যাটাস",
    price: "দাম",
    stock: "স্টক",
    variant: "ভ্যারিয়েন্ট",
  },

  search: {
    placeholder: "পণ্যের নাম দিয়ে খুঁজুন",
    aria: "পণ্য খুঁজুন",
  },

  form: {
    name: "নাম",
    description: "বিবরণ",
    variants: "ভ্যারিয়েন্ট",
    addOption: "অপশন যোগ করুন",
    status: "স্ট্যাটাস",
    collections: "কালেকশন",
    saved: "সেভ হয়েছে।",
    saving: "সেভ হচ্ছে…",
    saveProduct: "সেভ করুন",
    createProduct: "পণ্য তৈরি করুন",
    deleteProduct: "পণ্য মুছুন",
    saveFailed: "সেভ ব্যর্থ হয়েছে।",
    optionNamePlaceholder: "অপশনের নাম (যেমন সাইজ)",
    removeOption: "অপশন সরান",
    removeValueSuffix: "সরান",
    valuePlaceholder: "মান + Enter",
    images: "ছবি",
    cover: "কভার",
    moveLeft: "বামে",
    moveRight: "ডানে",
    removeImage: "সরান",
    uploadFailed: "আপলোড ব্যর্থ হয়েছে।",
    imageLabel: "ছবি",
    applyAllPrices: "সব দামে প্রয়োগ",
    applyAllStock: "সব স্টকে প্রয়োগ",
    bulkPricePlaceholder: "৳",
    bulkStockPlaceholder: "স্টক",
    price: "দাম",
    priceWithUnit: "দাম (৳)",
    stock: "স্টক",
    sku: "SKU",
    // R1 — পণ্যের ভিডিও আপলোড
    videos: "ভিডিও",
    videoLabel: "ভিডিও",
    videoHelp: "MP4 বা WebM · সর্বোচ্চ ৫০ এমবি",
    removeVideo: "ভিডিও সরান",
    moveVideoLeft: "ভিডিও বামে",
    moveVideoRight: "ভিডিও ডানে",
    uploadVideoFailed: "ভিডিও আপলোড ব্যর্থ হয়েছে।",
    videoPosterLabel: "কভার ছবি (ঐচ্ছিক)",
    videoDurationLabel: "দৈর্ঘ্য (সেকেন্ড)",
    videoTitleLabel: "শিরোনাম (ঐচ্ছিক)",
  },

  import: {
    title: "পণ্য ইম্পোর্ট (CSV)",
    subtitle: "Excel থেকে একসাথে পণ্য যোগ করুন",
    columnsLabel: "কলাম:",
    columnsHelp:
      "আবশ্যক। status: draft / active / archived (ডিফল্ট draft)। প্রতিটি পণ্যে একটি ডিফল্ট ভ্যারিয়েন্ট তৈরি হবে।",
    sampleCsv: "title,price,inventory,status\nসুতি পাঞ্জাবি,1290,20,active\nডেনিম শার্ট,990,15,draft",
    insertSample: "নমুনা বসান",
    pastePlaceholder: "এখানে CSV পেস্ট করুন…",
    importing: "ইম্পোর্ট হচ্ছে…",
    runImport: "ইম্পোর্ট করুন",
    createdSuffix: "টি পণ্য যোগ হয়েছে।",
    rowErrors: "সারি ত্রুটি:",
    lineLabel: "লাইন",
    notAdded: "যোগ হয়নি:",
  },
};
