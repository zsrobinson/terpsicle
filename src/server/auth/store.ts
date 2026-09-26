// D1 access for identity (migrations/0003_identity.sql). Every row read is
// validated; SQL lives here and nowhere else.
import {
  type Identity,
  type SessionRow,
  SessionRowSchema,
  type UserIdentityRow,
  UserIdentityRowSchema,
  type UserRow,
  UserRowSchema,
} from "~/core/schema";

export type UpsertResult =
  | { ok: true; user: UserRow }
  /** Google's `sub` is already another person's (it shouldn't happen). */
  | { ok: false; reason: "sub-conflict" };

/**
 * Inserts the person, or refreshes what Google says about them: the name,
 * picture URL and address always come from the latest sign-in (nothing is
 * edited in Terpsicle). Keyed on the directory ID, so terp@terpmail.umd.edu
 * and terp@umd.edu land on one row; each Google `sub` is recorded in
 * user_identities. Signing in also cancels a pending deletion.
 */
export async function upsertUser(
  db: D1Database,
  identity: Identity,
  now: Date,
): Promise<UpsertResult> {
  const at = now.toISOString();
  if (identity.sub !== null) {
    const owner = await db
      .prepare(
        "SELECT user_id FROM user_identities WHERE provider = 'google' AND sub = ?1",
      )
      .bind(identity.sub)
      .first<{ user_id: string }>();
    if (owner && owner.user_id !== identity.directoryId)
      return { ok: false, reason: "sub-conflict" };
  }
  const row = await db
    .prepare(
      `INSERT INTO users (id, email, hd, name, picture_url, status, created_at, last_sign_in_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6)
       ON CONFLICT (id) DO UPDATE SET
         email = excluded.email,
         hd = excluded.hd,
         name = excluded.name,
         picture_url = excluded.picture_url,
         status = 'active',
         delete_after = NULL,
         last_sign_in_at = excluded.last_sign_in_at
       RETURNING *`,
    )
    .bind(
      identity.directoryId,
      identity.email,
      identity.hd,
      identity.name,
      identity.pictureUrl,
      at,
    )
    .first();
  if (identity.sub !== null) {
    await db
      .prepare(
        `INSERT INTO user_identities (provider, sub, hd, email, user_id, created_at)
         VALUES ('google', ?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (provider, sub) DO UPDATE SET email = excluded.email`,
      )
      .bind(identity.sub, identity.hd, identity.email, identity.directoryId, at)
      .run();
  }
  return { ok: true, user: UserRowSchema.parse(row) };
}

export async function getUser(
  db: D1Database,
  id: string,
): Promise<UserRow | null> {
  const row = await db
    .prepare("SELECT * FROM users WHERE id = ?1")
    .bind(id)
    .first();
  return row ? UserRowSchema.parse(row) : null;
}

/** The Google accounts a person has signed in with, oldest first. */
export async function userIdentities(
  db: D1Database,
  userId: string,
): Promise<UserIdentityRow[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM user_identities WHERE user_id = ?1 ORDER BY created_at, hd",
    )
    .bind(userId)
    .all();
  return results.map((r) => UserIdentityRowSchema.parse(r));
}

export async function insertSession(
  db: D1Database,
  session: SessionRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
    .bind(
      session.id_hash,
      session.user_id,
      session.created_at,
      session.last_seen_at,
      session.expires_at,
    )
    .run();
}

/** The session and its active user, or null. */
export async function findSession(
  db: D1Database,
  idHash: string,
): Promise<{ session: SessionRow; user: UserRow } | null> {
  const [session, user] = await db.batch([
    db.prepare("SELECT * FROM sessions WHERE id_hash = ?1").bind(idHash),
    db
      .prepare(
        `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.id_hash = ?1 AND users.status = 'active'`,
      )
      .bind(idHash),
  ]);
  const sessionRow = session?.results[0];
  const userRow = user?.results[0];
  if (!sessionRow || !userRow) return null;
  return {
    session: SessionRowSchema.parse(sessionRow),
    user: UserRowSchema.parse(userRow),
  };
}

/**
 * Winds a session down to `expiresAt` for its daily refresh, only if no
 * other request did it first (compare-and-swap on `last_seen_at`). False
 * when another request won: that one's new session is the one to use.
 */
export async function retireSession(
  db: D1Database,
  idHash: string,
  seenAt: string,
  now: Date,
  expiresAt: Date,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE sessions SET last_seen_at = ?3, expires_at = ?4
       WHERE id_hash = ?1 AND last_seen_at = ?2`,
    )
    .bind(idHash, seenAt, now.toISOString(), expiresAt.toISOString())
    .run();
  return result.meta.changes === 1;
}

export async function deleteSession(
  db: D1Database,
  idHash: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE id_hash = ?1")
    .bind(idHash)
    .run();
}

/** Signs someone out everywhere. */
export async function deleteUserSessions(
  db: D1Database,
  userId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE user_id = ?1")
    .bind(userId)
    .run();
}

export async function markDeleting(
  db: D1Database,
  userId: string,
  deleteAfter: Date,
): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET status = 'deleting', delete_after = ?2 WHERE id = ?1",
    )
    .bind(userId, deleteAfter.toISOString())
    .run();
}

/** Points the user at our cached picture (a USER_CONTENT key), or none. */
export async function setPictureKey(
  db: D1Database,
  userId: string,
  key: string | null,
): Promise<void> {
  await db
    .prepare("UPDATE users SET picture_key = ?2 WHERE id = ?1")
    .bind(userId, key)
    .run();
}

/** Accounts whose week of grace after "Delete account" has ended. */
export async function accountsDueForPurge(
  db: D1Database,
  now: Date,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT id FROM users WHERE status = 'deleting' AND delete_after <= ?1",
    )
    .bind(now.toISOString())
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

/**
 * Deletes accounts whose week of grace has ended, with their identities and
 * sessions, then expired sessions. Returns the counts. (Their pictures are
 * in R2: the daily job deletes those first.)
 */
export async function purgeAccounts(
  db: D1Database,
  now: Date,
): Promise<{ accounts: number; sessions: number }> {
  const at = now.toISOString();
  // Dependent rows are deleted explicitly as well as by ON DELETE CASCADE,
  // so nothing of an account outlives it even where foreign keys are off.
  const due =
    "SELECT id FROM users WHERE status = 'deleting' AND delete_after <= ?1";
  const [, , accounts, sessions] = await db.batch([
    db.prepare(`DELETE FROM sessions WHERE user_id IN (${due})`).bind(at),
    db
      .prepare(`DELETE FROM user_identities WHERE user_id IN (${due})`)
      .bind(at),
    db
      .prepare(
        "DELETE FROM users WHERE status = 'deleting' AND delete_after <= ?1",
      )
      .bind(at),
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?1").bind(at),
  ]);
  return {
    accounts: accounts?.meta.changes ?? 0,
    sessions: sessions?.meta.changes ?? 0,
  };
}
