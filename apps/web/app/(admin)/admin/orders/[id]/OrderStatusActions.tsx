"use client";

// Order status actions (DESIGN §P3.3). The single contextual primary button
// (status-driven) + a cancel off-ramp. Posts updateOrderStatus; the server
// re-validates the transition and (for cancel) restores inventory.
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@hybrid/ui";
import { updateOrderStatus, type ActionResult } from "../actions";

interface Props {
  orderId: string;
  status: string;
  nextTo: string | null;
  nextLabel: string | null;
}

export function OrderStatusActions({ orderId, status, nextTo, nextLabel }: Props) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateOrderStatus,
    null,
  );
  const terminal = status === "cancelled" || status === "returned" || status === "delivered";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {nextTo && nextLabel && (
          <form action={formAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="to" value={nextTo} />
            <PrimaryButton label={nextLabel} />
          </form>
        )}
        {!terminal && (
          <form action={formAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="to" value="cancelled" />
            <CancelButton />
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

function PrimaryButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "অপেক্ষা করুন…" : label}
    </Button>
  );
}

function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending} className="text-danger">
      বাতিল করুন
    </Button>
  );
}
