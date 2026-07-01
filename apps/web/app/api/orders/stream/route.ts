// Server-Sent Events endpoint for real-time order notifications.
// Subscribes to postgres LISTEN/NOTIFY for the active tenant, streams matching
// events to the client as `data:` frames. One-way (server→client); clients
// reconnect automatically on disconnect via the EventSource protocol.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getActiveTenantId } from "@/lib/admin/data";
import { getOrderNotificationStream } from "@/lib/orders/notify";

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
      try {
        const send = (data: object, event?: string) => {
          const payload = event ? `event: ${event}\n` : "";
          controller.enqueue(
            encoder.encode(`${payload}data: ${JSON.stringify(data)}\n\n`),
          );
        };

        // Initial hello so the client knows the stream is alive.
        send({ ok: true, tenantId, t: Date.now() }, "ready");

        const subscription = await getOrderNotificationStream(
          tenantId,
          (event) => send(event),
        );

        // Heartbeat every 25s — proxies/nginx often close idle connections.
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            // controller closed — handled by cancel()
          }
        }, 25_000);

        // Close when client disconnects.
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
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}