// Bangla mirror of en/admin.ts.
import type { admin as EnAdmin } from "../en/admin";
import { products } from "./admin/products";
import { customers } from "./admin/customers";
import { collections } from "./admin/collections";
import { discounts } from "./admin/discounts";
import { returns } from "./admin/returns";
import { reviews } from "./admin/reviews";
import { cod } from "./admin/cod";
import { marketing } from "./admin/marketing";
import { reports } from "./admin/reports";
import { ordersDetail } from "./admin/ordersDetail";
import { themes } from "./admin/themes";
import { settingsGeneral } from "./admin/settingsGeneral";
import { settingsPayments } from "./admin/settingsPayments";
import { settingsComms } from "./admin/settingsComms";
import { settingsDbid } from "./admin/settingsDbid";
import { shipping } from "./admin/shipping";
import { wholesale } from "./admin/wholesale";
import { tasks } from "./admin/tasks";
import { leads } from "./admin/leads";
import { journeys } from "./admin/journeys";

export const admin: typeof EnAdmin = {
  products,
  tasks,
  leads,
  journeys,
  customers,
  collections,
  discounts,
  returns,
  reviews,
  cod,
  marketing,
  reports,
  ordersDetail,
  themes,
  settingsGeneral,
  settingsPayments,
  settingsComms,
  settingsDbid,
  shipping,
  wholesale,

  shell: {
    badge: "অ্যাডমিন",
    nav: "অ্যাডমিন নেভিগেশন",
    storeLink: "স্টোর",
  },

  nav: {
    home: "হোম",
    orders: "অর্ডার",
    products: "পণ্য",
    customers: "গ্রাহক",
    tasks: "কাজ",
    leads: "লিড",
    automations: "অটোমেশন",
    more: "আরও",
    wholesale: "পাইকারি",
    purchaseRequests: "পারচেজ রিকোয়েস্ট",
    themes: "থিম ও ডিজাইন",
    returns: "রিটার্ন / RTO",
    cod: "ক্যাশ অন ডেলিভারি",
    reports: "রিপোর্ট ও আয়-ব্যয়",
    marketing: "মার্কেটিং",
    reviews: "রিভিউ",
    settings: "সেটিংস",
    discounts: "ডিসকাউন্ট",
    collections: "কালেকশন",
    shipping: "শিপিং ও ডেলিভারি",
  },

  dashboard: {
    greeting: "সুপ্রভাত",
    newOrder: "নতুন অর্ডার",
    todayOrders: "আজকের অর্ডার",
    vsYesterday: "গতকালের চেয়ে",
    todaySales: "আজকের বিক্রি",
    codDue: "COD বকেয়া",
    ordersUnit: "টি অর্ডার",
    lowStock: "কম স্টক",
    awaitingConfirm: "টি অর্ডার কনফার্ম করা বাকি",
    salesTrend: "বিক্রির ধারা",
    last14days: "গত ১৪ দিন",
    days14: "১৪ দিন",
    monthSales: "এই মাসের বিক্রি",
    codCollected: "COD সংগৃহীত",
    collected: "সংগৃহীত",
    due: "বকেয়া",
    recentOrders: "সাম্প্রতিক অর্ডার",
    viewAllOrders: "সব অর্ডার দেখুন",
    noOrders: "এখনো কোনো অর্ডার নেই।",
    orderStatus: "অর্ডার স্ট্যাটাস",
    noData: "কোনো ডেটা নেই।",
  },

  orders: {
    title: "অর্ডার",
    codDue: "COD বকেয়া",
    empty: "কোনো অর্ডার নেই।",
    searchPlaceholder: "ফোন নম্বর বা অর্ডার # দিয়ে খুঁজুন",
    searchAria: "অর্ডার খুঁজুন",
    source: {
      all: "সব চ্যানেল",
      storefront: "স্টোরফ্রন্ট",
      manual: "ম্যানুয়াল",
      messenger: "মেসেঞ্জার",
    },
    statusPills: {
      all: "সব",
      pending: "অপেক্ষমাণ",
      confirmed: "নিশ্চিত",
      packed: "প্যাকড",
      shipped: "পাঠানো",
      delivered: "ডেলিভার্ড",
      returned: "ফেরত",
      cancelled: "বাতিল",
    },
    bulk: {
      selected: "টি নির্বাচিত",
      confirm: "নিশ্চিত করুন",
      pack: "প্যাক করুন",
      sendCourier: "কুরিয়ারে পাঠান",
      confirmShort: "নিশ্চিত",
      packShort: "প্যাক",
      courierShort: "কুরিয়ার",
      done: "টি সম্পন্ন",
      skipped: "টি বাদ",
      failed: "ব্যর্থ হয়েছে।",
      selectAll: "সব নির্বাচন",
      rowSelect: "অর্ডার নির্বাচন",
      colCustomer: "গ্রাহক",
      colTotal: "মোট",
      colFulfillment: "ফুলফিলমেন্ট",
      colPayment: "পেমেন্ট",
      colDate: "তারিখ",
    },
    create: {
      backToOrders: "অর্ডার",
      title: "নতুন অর্ডার",
      phone: "ফোন নম্বর",
      returningCustomer: "আগের গ্রাহক",
      namePlaceholder: "গ্রাহকের নাম",
      addProducts: "পণ্য যোগ করুন",
      qtyAria: "পরিমাণ",
      priceAria: "দাম",
      removeAria: "সরান",
      address: "ঠিকানা",
      detailedAddress: "বিস্তারিত ঠিকানা",
      addressPlaceholder: "বাসা, রোড, এলাকা",
      payment: "পেমেন্ট",
      cod: "ক্যাশ অন ডেলিভারি",
      bkash: "বিকাশ",
      channel: "চ্যানেল",
      manualPhone: "ম্যানুয়াল / ফোন",
      messengerChat: "মেসেঞ্জার / চ্যাট",
      deliveryCharge: "ডেলিভারি চার্জ (৳)",
      noteOptional: "নোট (ঐচ্ছিক)",
      grandTotal: "সর্বমোট",
      createAndAnother: "তৈরি করে আরেকটি",
      creating: "তৈরি হচ্ছে…",
      createOrder: "অর্ডার তৈরি করুন",
      createFailed: "অর্ডার তৈরি ব্যর্থ হয়েছে।",
      productSearchPlaceholder: "পণ্যের নাম বা SKU দিয়ে খুঁজুন (Enter দিয়ে যোগ করুন)",
      outOfStock: "স্টক নেই",
    },
    location: {
      division: "বিভাগ",
      district: "জেলা",
      thana: "থানা",
      select: "নির্বাচন করুন",
      selectSuffix: "নির্বাচন করুন",
      searchPlaceholder: "খুঁজুন…",
      countSuffix: "টি",
      nothingFound: "কিছু পাওয়া যায়নি।",
      close: "বন্ধ করুন",
    },
  },
};
