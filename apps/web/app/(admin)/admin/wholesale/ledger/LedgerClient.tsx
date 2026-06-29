"use client";

// Client component for ledger page — customer selector + inline forms.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LedgerForm } from "./LedgerForm";

export function LedgerClient({ customerId }: { customerId: string }) {
  const [showPayment, setShowPayment] = useState(false);
  const [showCreditNote, setShowCreditNote] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            setShowPayment(!showPayment);
            setShowCreditNote(false);
          }}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            showPayment
              ? "bg-success text-white"
              : "border border-success text-success hover:bg-success hover:text-white"
          }`}
        >
          Record Payment
        </button>
        <button
          onClick={() => {
            setShowCreditNote(!showCreditNote);
            setShowPayment(false);
          }}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            showCreditNote
              ? "bg-warning text-white"
              : "border border-warning text-warning hover:bg-warning hover:text-white"
          }`}
        >
          Issue Credit Note
        </button>
      </div>

      {showPayment && <LedgerForm customerId={customerId} />}
      {showCreditNote && <LedgerForm customerId={customerId} />}
    </div>
  );
}
