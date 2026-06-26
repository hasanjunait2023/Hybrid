"use client";

// React hook that opens an SSE connection to /api/orders/stream and fires
// `onEvent` for every order event. Auto-reconnects on disconnect with
// exponential backoff. The server uses tenant filtering so events are
// already scoped to the active store.

import { useEffect, useRef, useState } from "react";

export interface OrderEvent {
  type: "insert" | "update";
  orderId: string;
  tenantId: string;
  orderNumber: number;
  fulfillmentStatus: string;
  paymentStatus: string;
  grandTotal: number;
  at: string;
}

export type ConnectionStatus = "connecting" | "open" | "closed" | "error";

export function useOrderStream(options: {
  enabled?: boolean;
  onEvent: (event: OrderEvent) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}) {
  const { enabled = true, onEvent, onStatusChange } = options;
  const [status, setStatus] = useState<ConnectionStatus>("closed");
  const onEventRef = useRef(onEvent);
  const onStatusRef = useRef(onStatusChange);
  const retryRef = useRef(0);

  // Keep refs fresh without re-running the effect.
  useEffect(() => {
    onEventRef.current = onEvent;
    onStatusRef.current = onStatusChange;
  }, [onEvent, onStatusChange]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let es: EventSource | null = null;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const setAndNotify = (s: ConnectionStatus) => {
      setStatus(s);
      onStatusRef.current?.(s);
    };

    const connect = () => {
      if (cancelled) return;
      setAndNotify("connecting");
      es = new EventSource("/api/orders/stream");

      es.addEventListener("ready", () => {
        retryRef.current = 0;
        setAndNotify("open");
      });

      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as OrderEvent;
          onEventRef.current(data);
        } catch {
          // Malformed event — skip silently
        }
      };

      es.onerror = () => {
        setAndNotify("error");
        es?.close();
        es = null;
        // Exponential backoff: 1s, 2s, 4s, capped at 30s.
        const delay = Math.min(30_000, 1000 * 2 ** retryRef.current);
        retryRef.current += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      setAndNotify("closed");
    };
  }, [enabled]);

  return status;
}