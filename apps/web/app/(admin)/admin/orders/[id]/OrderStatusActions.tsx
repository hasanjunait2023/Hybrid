"use client";

// Order status actions (DESIGN §P3.3). The single contextual primary button
// (status-driven) + a cancel off-ramp. Posts updateOrderStatus; the server
// re-validates the transition and (for cancel) restores inventory.
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@hybrid/ui";
import { useDict } from "@/lib/i18n/provider";
import { updateOrderStatus, type ActionResult } from "../actions";

interface Props {
  orderId: string;
  status: string;
  nextTo: string | null;
}

type StatusActionKey = "confirmed" | "packed" | "shipped" | "delivered";

export function OrderStatusActions({ orderId, status, nextTo }: Props) {
  const t = useDict().admin.ordersDetail.statusActions;
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateOrderStatus,
    null,
  );
  const terminal = status === "cancelled" || status === "returned" || status === "delivered";
  const nextLabel = nextTo && nextTo in t ? t[nextTo as StatusActionKey] : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {nextTo && nextLabel && (
          <form action={formAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="to" value={nextTo} />
            <PrimaryButton label={nextLabel} waitLabel={t.waiting} />
          </form>
        )}
        {!terminal && (
          <form action={formAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="to" value="cancelled" />
            <CancelButton label={t.cancel} />
          </form>
        )}
      </div>
      {state?.error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}

function PrimaryButton({ label, waitLabel }: { label: string; waitLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? waitLabel : label}
    </Button>
  );
}

function CancelButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending} className="text-danger">
      {label}
    </Button>
  );
}
