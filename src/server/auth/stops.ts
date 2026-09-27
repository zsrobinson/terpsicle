// The owner's stops on writing (docs/V2.md §7.5, §10): `author_stops`
// (migrations/0013_author_stops.sql) and the `users` column each surface
// checks before a write. Reviews' store and Chat's object record who a stop
// is on; these statements then keep the column at the latest stop still in
// force, so undoing one stop never lifts another.
import type { ModerationKind } from "~/core/schema";

const COLUMN = {
  review: "reviews_blocked_until",
  chat: "chat_blocked_until",
} as const satisfies Record<ModerationKind, string>;

/** Records a stop on `userId`. Idempotent per stop id. */
export function recordStopStatement(
  db: D1Database,
  stop: {
    id: string;
    surface: ModerationKind;
    userId: string;
    until: string;
    now: Date;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO author_stops (id, surface, user_id, until, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT DO NOTHING`,
    )
    .bind(
      stop.id,
      stop.surface,
      stop.userId,
      stop.until,
      stop.now.toISOString(),
    );
}

/**
 * Puts a recorded stop in force: the column becomes its `until` unless a
 * later stop already holds it.
 */
export function applyStopStatement(
  db: D1Database,
  surface: ModerationKind,
  stopId: string,
): D1PreparedStatement {
  const column = COLUMN[surface];
  return db
    .prepare(
      `UPDATE users SET ${column} = MAX(COALESCE(${column}, ''), s.until)
       FROM (SELECT user_id, until FROM author_stops WHERE id = ?1 AND undone_at IS NULL) AS s
       WHERE users.id = s.user_id`,
    )
    .bind(stopId);
}

/**
 * Lifts one stop: marks it undone, and if it's the one in force, the column
 * falls back to the latest stop still in force (or none). Idempotent.
 */
export function liftStopStatements(
  db: D1Database,
  surface: ModerationKind,
  stopId: string,
  now: Date,
): D1PreparedStatement[] {
  const column = COLUMN[surface];
  return [
    db
      .prepare(
        "UPDATE author_stops SET undone_at = ?2 WHERE id = ?1 AND undone_at IS NULL",
      )
      .bind(stopId, now.toISOString()),
    db
      .prepare(
        `UPDATE users SET ${column} = (
           SELECT MAX(until) FROM author_stops
           WHERE user_id = users.id AND surface = ?2 AND undone_at IS NULL)
         FROM (SELECT user_id, until FROM author_stops WHERE id = ?1) AS s
         WHERE users.id = s.user_id AND users.${column} = s.until`,
      )
      .bind(stopId, surface),
  ];
}
