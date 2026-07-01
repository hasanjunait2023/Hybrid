import { withTenant } from "@hybrid/db";
import type { Tx } from "@hybrid/db";

// Server-side tracking event log. Append-only. Used by the Meta CAPI /
// Google Ads / TikTok senders in apps/web/lib/analytics to record every
// delivery attempt so the admin dashboard can show "did my pixel fire?"

export type TrackingEventStatus =
  | "sent"
  | "failed"
  | "skipped_consent"
  | "duplicate";

/** Log payload value: JSON-serializable primitives only. */
export type TrackingLogPayload =
  | string
  | number
  | boolean
  | null
  | { [key: string]: TrackingLogPayload }
  | TrackingLogPayload[];

export type LogTrackingEventInput = {
  tenantId: string;
  userId: string;
  eventId: string;
  eventName: string;
  platform: "meta" | "google" | "tiktok";
  source: "browser" | "server" | "test";
  status: TrackingEventStatus;
  payload?: TrackingLogPayload;
  responseCode?: number;
  responseBody?: string;
  errorMessage?: string;
  /** Optional TikTok / Meta test event code. */
  testEventCode?: string | null;
  /** Optional external dedup key (TikTok event_id etc.). */
  externalId?: string | null;
  /** Optional match-quality score (Phase C placeholder). */
  matchScore?: number | null;
};

/**
 * Record a single tracking event delivery attempt. Errors are swallowed —
 * logging must never break the user's checkout flow. Best-effort.
 */
export async function logTrackingEvent(input: LogTrackingEventInput): Promise<void> {
  try {
    await withTenant(input.tenantId, input.userId, (tx) =>
      tx`
        insert into tracking_event_log (
          tenant_id, event_id, event_name, platform, event_source,
          status, payload, response_code, response_body, error_message,
          test_event_code, external_id, match_score
        ) values (
          ${input.tenantId}::uuid,
          ${input.eventId},
          ${input.eventName},
          ${input.platform},
          ${input.source},
          ${input.status},
          ${input.payload ? tx.json(input.payload as Parameters<Tx["json"]>[0]) : null},
          ${input.responseCode ?? null},
          ${input.responseBody ? input.responseBody.slice(0, 4096) : null},
          ${input.errorMessage ?? null},
          ${input.testEventCode ?? null},
          ${input.externalId ?? null},
          ${input.matchScore ?? null}
        )
      `,
    );
  } catch (err) {
    console.error("[tracking] logTrackingEvent failed:", err);
  }
}

export type TrackingEventLogRow = {
  id: string;
  eventId: string;
  eventName: string;
  platform: "meta" | "google" | "tiktok";
  source: "browser" | "server" | "test";
  status: TrackingEventStatus;
  responseCode: number | null;
  errorMessage: string | null;
  occurredAt: Date;
};

export async function getRecentTrackingEvents(
  tenantId: string,
  userId: string,
  limit = 200,
): Promise<TrackingEventLogRow[]> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        id: string;
        event_id: string;
        event_name: string;
        platform: "meta" | "google" | "tiktok";
        event_source: "browser" | "server" | "test";
        status: TrackingEventStatus;
        response_code: number | null;
        error_message: string | null;
        occurred_at: Date;
      }[]
    >`
      select id, event_id, event_name, platform, event_source, status,
             response_code, error_message, occurred_at
        from tracking_event_log
       order by occurred_at desc
       limit ${limit}
    `,
  );
  return rows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    eventName: r.event_name,
    platform: r.platform,
    source: r.event_source,
    status: r.status,
    responseCode: r.response_code,
    errorMessage: r.error_message,
    occurredAt: r.occurred_at,
  }));
}

export async function getTrackingSummary(
  tenantId: string,
  userId: string,
): Promise<{
  last24h: { sent: number; failed: number; skipped: number };
}> {
  const rows = await withTenant(tenantId, userId, (tx) =>
    tx<
      {
        status: TrackingEventStatus;
        count: string;
      }[]
    >`
      select status, count(*)::text as count
        from tracking_event_log
       where occurred_at > now() - interval '24 hours'
       group by status
    `,
  );
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of rows) {
    const n = Number(r.count);
    if (Number.isNaN(n)) continue;
    if (r.status === "sent") sent += n;
    else if (r.status === "failed") failed += n;
    else if (r.status === "skipped_consent" || r.status === "duplicate") skipped += n;
  }
  return { last24h: { sent, failed, skipped } };
}
