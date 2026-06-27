// DBID Compliance Wizard — English source of truth.
// bn/admin/settingsDbid.ts mirrors this shape exactly.
//
// The wizard guides a seller through the 4 steps Bangladesh DBID requires:
// business identity → NID → TIN + Trade License → review & submit.
// The UI mirrors the gov.bd DBID portal flow so sellers aren't learning
// two interfaces.
export const settingsDbid = {
  settingsLink: "Settings",

  title: "DBID Compliance",
  intro:
    "Digital Business ID (DBID) is mandatory for Bangladesh e-commerce. Complete the 4 steps below, then we submit on your behalf. Your documents stay sealed and are only shared with DBID.",

  status: {
    not_started: "Not started",
    in_progress: "In progress",
    submitted: "Submitted — awaiting review",
    approved: "Approved ✓",
    rejected: "Rejected — see notes",
  },

  // ---- Step 1: Business identity -------------------------------------------
  step1: {
    title: "Business identity",
    hint:
      "Enter the business name exactly as it appears on your trade license. The owner name must match the NID you'll provide in step 2.",
    businessNameLabel: "Business name",
    businessNamePlaceholder: "e.g. Karim Electronics",
    businessTypeLabel: "Business type",
    businessTypes: {
      proprietorship: "Proprietorship (single owner)",
      partnership: "Partnership",
      ltd: "Limited company",
    },
    ownerFullNameLabel: "Owner full name",
    ownerFullNamePlaceholder: "As written on the NID",
    ownerDobLabel: "Owner date of birth",
  },

  // ---- Step 2: NID ---------------------------------------------------------
  step2: {
    title: "National ID (NID)",
    hint:
      "10 or 17 digit Bangladeshi national ID. We store only the last 4 digits for verification.",
    nidLabel: "NID number",
    nidPlaceholder: "10 or 17 digits",
  },

  // ---- Step 3: TIN + Trade License ----------------------------------------
  step3: {
    title: "TIN + Trade License",
    hint:
      "TIN (Tax Identification Number) is 12 digits. Trade License is issued by your city corporation / municipality.",
    tinLabel: "TIN number",
    tinPlaceholder: "12 digits",
    tradeLicenseLabel: "Trade License number",
    tradeLicensePlaceholder: "As on the certificate",
    tradeLicenseIssuedLabel: "Issued on",
    tradeLicenseExpiresLabel: "Expires on",
    binLabel: "BIN (VAT) — optional",
    binPlaceholder: "Business Identification Number (if registered for VAT)",
  },

  // ---- Step 4: Review & submit --------------------------------------------
  step4: {
    title: "Review & submit",
    hint:
      "Double-check every field. After submission, DBID usually responds within 5–10 working days. You'll get a 17-digit DBID number once approved.",
    confirmLabel:
      "I confirm the information above is accurate and I am authorised to submit on behalf of the business.",
  },

  // ---- Status banners -----------------------------------------------------
  reviewNotes: "Reviewer notes",
  dbidNumber: "DBID number",
  expiresOn: "Expires on",
  submittedOn: "Submitted on",

  // ---- Errors / actions ---------------------------------------------------
  saveFailed: "Save failed.",
  submitFailed: "Submission failed.",
  nextStep: "Next step",
  previousStep: "Previous",
  saveDraft: "Save draft",
  submitForReview: "Submit for DBID review",
  statusBadgeLabel: "DBID",
  sectionLabel: "DBID Compliance",
  sectionSub: "Bangladesh Digital Business ID — mandatory for sellers",
};