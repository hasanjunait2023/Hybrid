// Bangla mirror of en/admin/leads.ts.
import type { leads as En } from "../../en/admin/leads";

export const leads: typeof En = {
  title: "লিড পাইপলাইন",
  subtitle: "যারা এখনো অর্ডার করেনি — তাদের বিক্রিতে রূপান্তর করুন।",

  openLeads: "চলমান লিড",
  pipelineValue: "পাইপলাইন মূল্য",

  stage: {
    new: "নতুন",
    contacted: "যোগাযোগ হয়েছে",
    qualified: "যাচাইকৃত",
    won: "সফল",
    lost: "হারানো",
  },
  source: {
    manual: "ম্যানুয়াল",
    abandoned_cart: "অসম্পূর্ণ কার্ট",
    inquiry: "জিজ্ঞাসা",
    facebook: "ফেসবুক",
    whatsapp: "হোয়াটসঅ্যাপ",
  },

  nameLabel: "নাম",
  namePlaceholder: "গ্রাহকের নাম",
  phoneLabel: "ফোন",
  phonePlaceholder: "01XXXXXXXXX",
  valueLabel: "আনুমানিক মূল্য (৳)",
  sourceLabel: "উৎস",
  noteLabel: "নোট",
  notePlaceholder: "তারা কী চায়?",
  add: "লিড যোগ করুন",
  adding: "যোগ হচ্ছে…",
  addFailed: "লিডটি যোগ করা যায়নি।",

  empty: "কোনো লিড নেই।",
  filterAll: "সব",
  advance: "পরবর্তী ধাপ",
  markLost: "হারানো",
  convert: "গ্রাহকে রূপান্তর",
  convertNoPhone: "রূপান্তর করতে একটি ফোন নম্বর দিন।",
  delete: "মুছুন",
  viewCustomer: "গ্রাহক দেখুন",
  noName: "নামহীন",
};
