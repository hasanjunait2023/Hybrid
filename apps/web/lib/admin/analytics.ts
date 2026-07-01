// Admin analytics dashboard data layer.
//
// Provides two surfaces:
//   1. `/admin/analytics` page cards + 30-day chart + recent event log.
//   2. `/admin/settings/analytics` test-event status summary.
//
// All queries go through withTenant so RLS holds. Aggregates are computed
// from the tracking_event_log table written by `lib/analytics/log.ts`.
import { withTenant } from "@hybrid/db";
import type { TrackingEventStatus } from "../analytics/log";

export type AnalyticsSummary = {
  last24h: { sent: number; failed: number; skipped: number };
  last7d: { sent: number; failed: number };
  last30d: { sent: number; failed: number };
  topEvents: { eventName: string; count: number }[];
  topPlatforms: { platform: "meta" | "google" | "tiktok"; count: number }[];
  recent: AnalyticsEventRow[];
};

export type AnalyticsEventRow = {
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

export type AnalyticsDaySeries = {
  day: string;
  sent: number;
  failed: number;
  skipped: number;
}[];

export async function getAnalyticsSummary(
  tenantId: string,
  userId: string,
): Promise<AnalyticsSummary> {
  const [last24hRows, last7dRows, last30dRows, topEvents, topPlatforms, recent] = await Promise.all([
    getWindowAggregate(tenantId, userId, 1),
    getWindowAggregate(tenantId, userId, 7),
    getWindowAggregate(tenantId, userId, 30),
    getTopEvents(tenantId, userId),
    getTopPlatforms(tenantId, userId),
    getRecentAnalyticsEvents(tenantId, userId, 50),
  ]);

  return {
    last24h: { sent: last24hRows.sent, failed: last24hRows.failed, skipped: last24hRows.skipped },
    last7d: { sent: last7dRows.sent, failed: last7dRows.failed },
    last30d: { sent: last30dRows.sent, failed: last30dRows.failed },
    topEvents,
    topPlatforms,
    recent,
  };
}

async function getWindowAggregate(
  tenantId: string,
  userId: string,
  days: number,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const rows = await withTenant(tenantId, userId, async (tx) =>
    tx<{ status: TrackingEventStatus; count: string }[]>`
      select status, count(*)::text as count
        from tracking_event_log
       where tenant_id = ${tenantId}::uuid
         and occurred_at > now() - ${`${days} days`}::interval
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
  return { sent, failed, skipped };
}

async function getTopEvents(
  tenantId: string,
  userId: string,
  limit = 5,
): Promise<{ eventName: string; count: number }[]> {
  const rows = await withTenant(tenantId, userId, async (tx) =>
    tx<{ event_name: string; count: string }[]>`
      select event_name, count(*)::text as count
        from tracking_event_log
       where tenant_id = ${tenantId}::uuid
         and occurred_at > now() - interval '30 days'
       group by event_name
       order by count desc
       limit ${limit}
    `,
  );
  return rows.map((r) => ({
    eventName: r.event_name,
    count: Number(r.count) || 0,
  }));
}

async function getTopPlatforms(
  tenantId: string,
  userId: string,
  limit = 3,
): Promise<{ platform: "meta" | "google" | "tiktok"; count: number }[]> {
  const rows = await withTenant(tenantId, userId, async (tx) =>
    tx<{ platform: "meta" | "google" | "tiktok"; count: string }[]>`
      select platform, count(*)::text as count
        from tracking_event_log
       where tenant_id = ${tenantId}::uuid
         and occurred_at > now() - interval '30 days'
       group by platform
       order by count desc
       limit ${limit}
    `,
  );
  return rows.map((r) => ({
    platform: r.platform,
    count: Number(r.count) || 0,
  }));
}

export async function getRecentAnalyticsEvents(
  tenantId: string,
  userId: string,
  limit = 200,
): Promise<AnalyticsEventRow[]> {
  const rows = await withTenant(tenantId, userId, async (tx) =>
    tx<{
      id: string;
      event_id: string;
      event_name: string;
      platform: "meta" | "google" | "tiktok";
      event_source: "browser" | "server" | "test";
      status: TrackingEventStatus;
      response_code: number | null;
      error_message: string | null;
      occurred_at: Date;
    }[]>`
      select id, event_id, event_name, platform, event_source, status,
             response_code, error_message, occurred_at
        from tracking_event_log
       where tenant_id = ${tenantId}::uuid
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

export async function getAnalyticsDaySeries(
  tenantId: string,
  userId: string,
  days = 30,
): Promise<AnalyticsDaySeries> {
  const rows = await withTenant(tenantId, userId, async (tx) =>
    tx<{ day: string; status: TrackingEventStatus; count: string }[]>`
      select date_trunc('day', occurred_at)::date as day,
             status,
             count(*)::text as count
        from tracking_event_log
       where tenant_id = ${tenantId}::uuid
         and occurred_at > now() - ${`${days} days`}::interval
       group by day, status
       order by day asc
    `,
  );

  const map = new Map<string, { sent: number; failed: number; skipped: number }>();
  for (const r of rows) {
    const day = String(r.day);
    const bucket = map.get(day) ?? { sent: 0, failed: 0, skipped: 0 };
    const n = Number(r.count) || 0;
    if (r.status === "sent") bucket.sent += n;
    else if (r.status === "failed") bucket.failed += n;
    else if (r.status === "skipped_consent" || r.status === "duplicate") bucket.skipped += n;
    map.set(day, bucket);
  }

  // Fill missing days so the chart line doesn't break.
  const result: AnalyticsDaySeries = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const day = d.toISOString().split("T")[0] ?? "";
    const bucket = map.get(day) ?? { sent: 0, failed: 0, skipped: 0 };
    result.push({ day, ...bucket });
  }
  return result;
}

export async function getAnalyticsTestEventsStatus(
  tenantId: string,
  userId: string,
): Promise<{
  testEvents: AnalyticsEventRow[];
  last24h: { sent: number; failed: number; skipped: number };
}> {
  const rows = await withTenant(tenantId, userId, async (tx) =>
    tx<{
      id: string;
      event_id: string;
      event_name: string;
      platform: "meta" | "google" | "tiktok";
      event_source: "browser" | "server" | "test";
      status: TrackingEventStatus;
      response_code: number | null;
      error_message: string | null;
      occurred_at: Date;
    }[]>`
      select id, event_id, event_name, platform, event_source, status,
             response_code, error_message, occurred_at
        from tracking_event_log
       where tenant_id = ${tenantId}::uuid
         and event_source = 'test'
         and occurred_at > now() - interval '24 hours'
       order by occurred_at desc
       limit 50
    `,
  );

  const testEvents = rows.map((r) => ({
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

  const last24h = await getWindowAggregate(tenantId, userId, 1);
  return { testEvents, last24h };
}

/** Count events currently sitting in the retry queue + dead letter. */
export async function getRetryQueueOverview(
  tenantId: string,
  userId: string,
): Promise<{
  queued: number;
  dead: number;
}> {
  const queuedRows = await withTenant(tenantId, userId, async (tx) =>
    tx<{ count: string }[]>`
      select count(*)::text as count
        from tracking_event_queue
       where tenant_id = ${tenantId}::uuid
    `,
  );
  const deadRows = await withTenant(tenantId, userId, async (tx) =>
    tx<{ count: string }[]>`
      select count(*)::text as count
        from tracking_event_dead_letter
       where tenant_id = ${tenantId}::uuid
    `,
  );
  return {
    queued: Number(queuedRows[0]?.count) || 0,
    dead: Number(deadRows[0]?.count) || 0,
  };
}
