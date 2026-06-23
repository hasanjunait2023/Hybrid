"use client";

// "Send to Steadfast" action button (DESIGN §P3.1/§P3.3 — "কুরিয়ারে পাঠান").
// A ready client wrapper for the sendToCourier Server Action. Standalone (not
// wired into the Wave-1 page.tsx, which this slice must not edit) so the orders
// surface can drop it in: <SendToCourierButton orderId={...} />.
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, TruckIcon } from "@hybrid/ui";
import { sendToCourier, type CourierActionResult } from "./courier-actions";

export function SendToCourierButton({ orderId }: { orderId: string }) {
  const [state, formAction] = useActionState<CourierActionResult | null, FormData>(
    sendToCourier,
    null,
  );

  if (state?.ok) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-st-shipped">
        <TruckIcon className="h-4 w-4" />
        কুরিয়ারে পাঠানো হয়েছে — ট্র্যাকিং {state.trackingCode}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <SubmitButton />
      </form>
      {state?.error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {state.error}
        </p>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <TruckIcon className="mr-1.5 h-4 w-4" />
      {pending ? "পাঠানো হচ্ছে…" : "কুরিয়ারে পাঠান"}
    </Button>
  );
}
