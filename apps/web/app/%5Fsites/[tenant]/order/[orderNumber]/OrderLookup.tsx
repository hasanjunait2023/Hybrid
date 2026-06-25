"use client";
// Phone-gated order lookup form (DESIGN P1.7 "Track later"). No buyer account —
// the phone is the access token. Submits the phone as a query param so the
// server component re-renders the gated order (shareable + back-button safe).
import { useState } from "react";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";

interface OrderLookupProps {
  orderNumber: number;
}

export function OrderLookup({ orderNumber }: OrderLookupProps) {
  const d = useDict();
  const o = d.storefront.order;
  const [phone, setPhone] = useState("");

  return (
    <div className="mx-auto max-w-[480px] px-4 py-12">
      <h1 className="bn-heading mb-2 text-xl font-bold text-ink">{o.findOrder}</h1>
      <p className="bn-body mb-6 text-sm text-ink-muted">
        {o.findOrderHint}
      </p>
      <form
        method="get"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          if (!phone.trim()) e.preventDefault();
        }}
      >
        <input
          type="tel"
          inputMode="tel"
          name="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="01XXXXXXXXX"
          className="h-11 rounded-sm border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle"
        />
        <Button variant="primary" size="lg" type="submit">
          {o.viewOrder.replace("{n}", String(orderNumber))}
        </Button>
      </form>
    </div>
  );
}
