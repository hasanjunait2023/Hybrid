// Bangla mirror of en/admin/tasks.ts.
import type { tasks as En } from "../../en/admin/tasks";

export const tasks: typeof En = {
  title: "কাজ ও ফলো-আপ",
  subtitle: "স্টাফের করণীয় — কল ব্যাক, COD কনফার্ম, ফলো-আপ।",

  titleLabel: "কাজ",
  titlePlaceholder: "যেমন: ডেলিভারি নিয়ে কল ব্যাক করুন",
  noteLabel: "নোট (ঐচ্ছিক)",
  notePlaceholder: "বিস্তারিত…",
  dueLabel: "শেষ সময়",
  priorityLabel: "অগ্রাধিকার",
  priority: { low: "কম", normal: "সাধারণ", high: "জরুরি" },
  add: "যোগ করুন",
  adding: "যোগ হচ্ছে…",
  addFailed: "কাজটি যোগ করা যায়নি।",

  empty: "কোনো কাজ নেই — সব শেষ!",
  markDone: "সম্পন্ন",
  reopen: "পুনরায় চালু",
  delete: "মুছুন",
  overdue: "সময় পেরিয়েছে",
  dueToday: "আজকের",
  noDue: "সময় নেই",

  filterOpen: "চলমান",
  filterDone: "সম্পন্ন",
  filterAll: "সব",

  widgetTitle: "আজকের কাজ",
  widgetOverdue: "বকেয়া",
  widgetDueToday: "আজকের",
  viewAll: "সব দেখুন",
  widgetEmpty: "কোনো চলমান কাজ নেই।",
};
