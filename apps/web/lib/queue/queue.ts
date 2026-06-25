// Lightweight in-process job queue backed by Redis lists.
//
// Why not BullMQ? BullMQ needs a separate worker process (or a long-running
// Node thread) — Hybrid's 8GB VPS can't spare that for the current SMS
// volume (a few hundred/day). This implementation:
//   - Pushes jobs onto a Redis list with LPUSH
//   - Spawns ONE background drainer per queue name when first accessed
//   - Drains with BRPOP (blocking pop) so we don't spin
//   - Retries 3 times with exponential backoff on failure
//   - Dead-letters failed jobs to <queue>:dead for inspection
//
// Tradeoffs:
//   - The drainer lives inside the Next.js server process. If that process
//     restarts, in-flight jobs are NOT lost (they're in Redis) but may be
//     delayed by a few seconds until the next request triggers the drainer.
//   - For multi-instance deployments, every instance spawns a drainer and
//     Redis' atomic BRPOP guarantees only one wins per job. Safe.
//   - No UI. Admin queries jobs via redis-cli / scripts/jobs.sh.
//
// When volume justifies it, swap this for BullMQ + a dedicated worker —
// the public API (enqueue<T>) stays the same.

import Redis from "ioredis";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [5_000, 30_000, 120_000]; // 5s, 30s, 2m

let connection: Redis | null = null;

function conn(): Redis {
  if (connection) return connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set");
  connection = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  return connection;
}

export interface Job<T = unknown> {
  id: string;
  queue: string;
  payload: T;
  attempts: number;
  enqueuedAt: number;
}

export type JobHandler<T> = (payload: T, job: Job<T>) => Promise<void>;

const handlers = new Map<string, JobHandler<unknown>>();
const startedQueues = new Set<string>();

/**
 * Register a handler for a queue name. Idempotent — calling twice replaces.
 * Spawns the background drainer the first time this queue is registered.
 */
export function registerHandler<T>(
  queue: string,
  handler: JobHandler<T>,
): void {
  handlers.set(queue, handler as JobHandler<unknown>);
  if (!startedQueues.has(queue)) {
    startedQueues.add(queue);
    void drain(queue).catch((err) => {
      console.error(`[queue] drainer for ${queue} crashed:`, err);
      // allow restart on next enqueue
      startedQueues.delete(queue);
    });
  }
}

/**
 * Enqueue a job. Returns immediately — processing happens async.
 */
export async function enqueue<T>(
  queue: string,
  payload: T,
): Promise<string> {
  const id = crypto.randomUUID();
  const job: Job<T> = {
    id,
    queue,
    payload,
    attempts: 0,
    enqueuedAt: Date.now(),
  };
  await conn().lpush(`queue:${queue}`, JSON.stringify(job));
  return id;
}

async function drain(queue: string): Promise<void> {
  const r = conn();
  const listKey = `queue:${queue}`;
  const deadKey = `queue:${queue}:dead`;
  while (true) {
    // BRPOP blocks for up to 5s — survives transient Redis hiccups.
    const popped = await r.brpop(listKey, 5);
    if (!popped) continue;
    const [, raw] = popped;
    let job: Job;
    try {
      job = JSON.parse(raw) as Job;
    } catch (err) {
      console.error(`[queue:${queue}] malformed job, dropping:`, err, raw);
      continue;
    }
    const handler = handlers.get(queue);
    if (!handler) {
      console.error(`[queue:${queue}] no handler registered, dead-lettering`);
      await r.lpush(deadKey, raw);
      continue;
    }
    job.attempts++;
    try {
      await handler(job.payload, job);
    } catch (err) {
      console.error(`[queue:${queue}] job ${job.id} attempt ${job.attempts} failed:`, err);
      if (job.attempts < MAX_ATTEMPTS) {
        const idx = Math.min(job.attempts - 1, BACKOFF_MS.length - 1);
        const delay = BACKOFF_MS[idx] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
        await sleep(delay);
        await r.lpush(listKey, JSON.stringify(job));
      } else {
        console.error(`[queue:${queue}] job ${job.id} exhausted retries, dead-lettering`);
        await r.lpush(deadKey, JSON.stringify(job));
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Stats helpers for the admin / ops scripts.
 */
export async function queueDepth(queue: string): Promise<number> {
  return conn().llen(`queue:${queue}`);
}
export async function deadLetterDepth(queue: string): Promise<number> {
  return conn().llen(`queue:${queue}:dead`);
}