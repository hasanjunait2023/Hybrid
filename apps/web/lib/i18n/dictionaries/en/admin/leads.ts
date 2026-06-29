// CRM lead pipeline admin strings (Phase R1.3). English source of truth;
// bn/admin/leads.ts mirrors this shape exactly.
export const leads = {
  title: "Lead pipeline",
  subtitle: "Prospects who haven't ordered yet — chase them to a sale.",

  openLeads: "Open leads",
  pipelineValue: "Pipeline value",

  stage: {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    won: "Won",
    lost: "Lost",
  },
  source: {
    manual: "Manual",
    abandoned_cart: "Abandoned cart",
    inquiry: "Inquiry",
    facebook: "Facebook",
    whatsapp: "WhatsApp",
  },

  nameLabel: "Name",
  namePlaceholder: "Customer name",
  phoneLabel: "Phone",
  phonePlaceholder: "01XXXXXXXXX",
  valueLabel: "Est. value (৳)",
  sourceLabel: "Source",
  noteLabel: "Note",
  notePlaceholder: "What do they want?",
  add: "Add lead",
  adding: "Adding…",
  addFailed: "Could not add the lead.",

  empty: "No leads yet.",
  filterAll: "All",
  advance: "Advance",
  markLost: "Mark lost",
  convert: "Convert → customer",
  convertNoPhone: "Add a phone number to convert this lead.",
  delete: "Delete",
  viewCustomer: "View customer",
  noName: "Unnamed",
};
