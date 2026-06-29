// Server-Sent Events endpoint for real-time shipment status notifications.
// Subscribes to postgres LISTEN/NOTIFY for the active tenant's shipments,
// streams status changes (in_transit, delivered, returned, etc.) as `data:`
// frames. Mirrors /api/orders/stream — same SSE protocol, same auth guard.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getShipmentNotificationStream } from "@/lib/shipments/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // pg NOTIFY needs TCP — edge runtime unsupported

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const tenantId = await getActiveTenantId(session.userId);
  if (!tenantId) {
    return new Response("No store", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object, event?: string) => {
        const prefix = event ? `event: ${event}\n` : "";
        controller.enqueue(
          encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`),
        );
      };

      send({ ok: true, tenantId, t: Date.now() }, "ready");

      const subscription = await getShipmentNotificationStream(
        tenantId,
        (event) => send(event),
      );

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // controller closed
        }
      }, 25_000);

      const onAbort = () => {
        clearInterval(heartbeat);
        subscription.unsubscribe().catch(() => undefined);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
