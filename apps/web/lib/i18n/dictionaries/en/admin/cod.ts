// COD-pending + COD & Settlements admin strings. English source of truth;
// bn/admin/cod.ts mirrors this shape exactly.
export const cod = {
  // COD-pending list page (/admin/cod)
  pending: {
    title: "COD due",
    expectedCollection: "Expected collection",
    shipmentsUnit: " shipments",
    note: "ⓘ This is the expected total of COD still uncollected by the courier. Courier remittance reconciliation comes in a later step.",
    empty: "No COD due.",
    tracking: "Tracking",
  },

  // COD & Settlements page (/admin/cod/settlements)
  settlements: {
    title: "COD & settlements",
    upload: "Upload remittance CSV",
    summary: {
      expected: "Expected COD",
      collected: "Collected",
      remitted: "Remitted",
      discrepancyLabel: "Discrepancy / due",
    },
    emptyRows: {
      title: "No COD shipments yet",
      hint: "Once you send orders to a courier they show up here; upload the remittance CSV to reconcile them.",
    },
    table: {
      shipmentOrder: "Shipment / order",
      expected: "Expected",
      collected: "Collected",
      remitted: "Remitted",
      discrepancy: "Δ discrepancy",
      status: "Status",
    },
    missingRemittance: "⚠ No remittance found",
    batchesHeading: "Remittance batches",
    emptyBatches: {
      title: "No remittance uploaded yet",
      hint: "Download the CSV from the courier and upload it.",
    },
    unmatched: "Unmatched",
    footnote: "All figures come from your own data — Hybrid never touches the money.",
  },

  // Mark-resolved action (ResolveButton)
  resolve: {
    resolved: "✓ Resolved",
    confirm: "Settled with the courier — mark as resolved?",
    button: "Mark resolved",
    pending: "…",
  },

  // Remittance CSV upload (RemittanceUpload)
  remittance: {
    upload: "Upload remittance CSV",
    csvLabel: "CSV file",
    referenceLabel: "Reference (optional)",
    referencePlaceholder: "Batch / invoice ID",
    hint: "Column names are not confirmed yet — check against the real CSV. Max 500 lines.",
    submit: "Upload & reconcile",
    submitting: "Processing…",
    matchedLines: "lines matched",
    unmatchedLines: "lines unmatched",
    discrepanciesFound: "discrepancies found.",
  },
};
