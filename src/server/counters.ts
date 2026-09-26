// Fixed-window counters in D1 (the `counters` table): API rate limits and the
// daily summary cap. One atomic upsert per hit, so concurrent requests can't
// both slip under a limit.

export interface Window {
  /** Window length in seconds (3600 = hourly, 86400 = UTC day). */
  seconds: number;
}

export function windowStart(now: Date, seconds: number): Date {
  const ms = seconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/** Adds one to `name` in the current window; returns the new count. */
export async function hit(
  db: D1Database,
  name: string,
  window: Window,
  now: Date,
): Promise<number> {
  const start = windowStart(now, window.seconds).toISOString();
  const row = await db
    .prepare(
      `INSERT INTO counters (name, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (name, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(name, start)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

/** `name`'s count in the current window, without adding to it. */
export async function readCount(
  db: D1Database,
  name: string,
  window: Window,
  now: Date,
): Promise<number> {
  const start = windowStart(now, window.seconds).toISOString();
  const row = await db
    .prepare("SELECT count FROM counters WHERE name = ?1 AND window_start = ?2")
    .bind(name, start)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** Seconds until the current window ends. */
export function secondsLeft(window: Window, now: Date): number {
  const end =
    windowStart(now, window.seconds).getTime() + window.seconds * 1000;
  return Math.max(1, Math.ceil((end - now.getTime()) / 1000));
}

/** Drops windows that ended more than two days ago. */
export async function pruneCounters(db: D1Database, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  await db
    .prepare("DELETE FROM counters WHERE window_start < ?1")
    .bind(cutoff)
    .run();
}
