// Plan sync's D1 side (docs/V2.md §5.2, migrations/0005_sync.sql). D1 has no
// interactive transactions, but a batch runs as one: each push is a single
// batch, so its reads, head bumps and writes can't interleave with another
// push, and of two pushes on the same base rev exactly one wins.
//
// Every `sync_docs.body` is sealed with the account's key, bound to its
// (user, kind, doc id) (docs/DATA.md §7.7, migrations/0025_sync_encryption.sql).
// This is the only file that touches the table's rows
// (scripts/check-imports.ts): Chat and the calendar feed read plans and
// settings through `livePlans`, `settingsDocOf` and `membershipDocs` below,
// and every body is opened by `openBody`. A body in plain text (saved by the
// build before sealing, between the migration and the deploy) is never read
// as data: it's deleted on sight, and the account's devices start over.
import { z } from "zod";
import {
  type MainPlans,
  type Plan,
  PlanDocSchema,
  RevSchema,
  type SettingsDoc,
  SettingsDocSchema,
  SYNC_MAX_FOUR_YEAR_DOCS,
  SYNC_MAX_PLANS,
  SYNC_PULL_PAGE,
  SYNC_TOMBSTONE_DAYS,
  type SyncDocRow,
  SyncDocRowSchema,
  type SyncPullResult,
  type SyncPushDoc,
  type SyncPushDocResult,
  syncDocFromRow,
  type TermId,
} from "~/core/schema";
import { isSealed, UNSEALED } from "../security/seal";
import {
  type AccountKey,
  openForAccount,
  SealedDataError,
  sealForAccount,
  type UserData,
} from "../security/user-keys";

const DAY_MS = 86_400_000;

const SavedSchema = z.object({ rev: RevSchema.min(1) });
const HeadSchema = z.object({ head: RevSchema, pruned_through: RevSchema });

const DOC_COLUMNS = "kind, doc_id, rev, deleted, body, updated_at";

/** Live docs of each kind an account may hold; there's one settings doc. */
const CAPS = {
  plan: SYNC_MAX_PLANS,
  "four-year": SYNC_MAX_FOUR_YEAR_DOCS,
  settings: 1,
} as const satisfies Record<SyncPushDoc["kind"], number>;

/**
 * Whether a doc may be saved: its stored rev (0 when there's no row) is the
 * push's base, and it wouldn't be a new live doc past its kind's cap (CAPS:
 * SYNC_MAX_PLANS plans, SYNC_MAX_FOUR_YEAR_DOCS four-year plans).
 * Params: ?1 user, ?2 kind, ?3 doc id, ?4 base rev, ?5 deleted, ?6 the cap.
 */
const MAY_SAVE = `
  COALESCE(
    (SELECT rev FROM sync_docs WHERE user_id = ?1 AND kind = ?2 AND doc_id = ?3),
    0
  ) = ?4
  AND (
    ?5 = 1 OR ?2 = 'settings'
    OR EXISTS (
      SELECT 1 FROM sync_docs
      WHERE user_id = ?1 AND kind = ?2 AND doc_id = ?3 AND deleted = 0
    )
    OR (
      SELECT COUNT(*) FROM sync_docs
      WHERE user_id = ?1 AND kind = ?2 AND deleted = 0
    ) < ?6
  )`;

/** Takes the next rev, only if the doc may be saved. */
const BUMP_HEAD = `UPDATE sync_heads SET head = head + 1
  WHERE user_id = ?1 AND ${MAY_SAVE}`;

/**
 * Saves the doc at the rev BUMP_HEAD just took, under the same condition
 * (nothing in between changed it). ?7 term, ?8 body JSON, ?9 server time.
 * A tombstone keeps its plan's term.
 */
const SAVE_DOC = `INSERT INTO sync_docs
    (user_id, kind, doc_id, term_id, rev, deleted, body, updated_at)
  SELECT ?1, ?2, ?3, ?7, head, ?5, ?8, ?9 FROM sync_heads
  WHERE user_id = ?1 AND ${MAY_SAVE}
  ON CONFLICT (user_id, kind, doc_id) DO UPDATE SET
    term_id = COALESCE(excluded.term_id, sync_docs.term_id),
    rev = excluded.rev,
    deleted = excluded.deleted,
    body = excluded.body,
    updated_at = excluded.updated_at
  RETURNING rev`;

/**
 * Moves the head on one and counts every rev up to it as pruned, so a pull
 * from any cursor handed out before answers `reset` (as
 * migrations/0025_sync_encryption.sql does for every account).
 */
const START_OVER = `UPDATE sync_heads SET head = head + 1, pruned_through = head + 1`;

// ---------- Sealed bodies ----------

/** Where a body lives: what it's bound to, after the account's id. */
export const bodyWhere = (kind: string, docId: string) => [
  "sync-doc",
  kind,
  docId,
];

/** A body sealed for its row. */
function sealBody(
  account: AccountKey | null,
  kind: string,
  docId: string,
  json: string,
): Promise<string> {
  if (!account) throw new SealedDataError();
  return sealForAccount(account, bodyWhere(kind, docId), json);
}

/**
 * The one way a stored body is read: opened with the account's key for the
 * row it's in, so a body copied to another row or account, or changed,
 * throws (SealedDataError) rather than being read.
 */
function openBody(
  account: AccountKey | null,
  kind: string,
  docId: string,
  sealed: string,
): Promise<string> {
  if (!account) throw new SealedDataError();
  return openForAccount(account, bodyWhere(kind, docId), sealed);
}

/** A row as stored, with its body opened (still JSON text). */
async function openRow(
  account: AccountKey | null,
  row: SyncDocRow,
): Promise<SyncDocRow> {
  if (row.body === null) return row;
  return {
    ...row,
    body: await openBody(account, row.kind, row.doc_id, row.body),
  };
}

interface StoredBody {
  kind: string;
  doc_id: string;
  body: string | null;
}

/** The rows whose body is in plain text: never read, only deleted. */
const unsealed = <T extends StoredBody>(rows: readonly T[]): T[] =>
  rows.filter((r) => r.body !== null && !isSealed(r.body));

/**
 * Deletes plain-text bodies (each only while it's still the one read) and
 * starts the account's devices over: they'll put back what they have. Logs
 * how many, never what.
 */
async function dropUnsealed(
  db: D1Database,
  userId: string,
  rows: readonly StoredBody[],
): Promise<void> {
  const results = await db.batch([
    ...rows.map((r) =>
      db
        .prepare(
          "DELETE FROM sync_docs WHERE user_id = ?1 AND kind = ?2 AND doc_id = ?3 AND body = ?4",
        )
        .bind(userId, r.kind, r.doc_id, r.body),
    ),
    db.prepare(`${START_OVER} WHERE user_id = ?1`).bind(userId),
  ]);
  const dropped = results
    .slice(0, rows.length)
    .reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  console.warn({ sync: "deleted bodies saved in plain text", dropped });
}

/**
 * The daily job's sweep for plain-text bodies nobody has read since: the
 * same as `dropUnsealed`, for every account. Returns how many went.
 */
export async function sweepUnsealedBodies(db: D1Database): Promise<number> {
  const plain = `body IS NOT NULL AND ${UNSEALED("body")}`;
  const [, deleted] = await db.batch([
    db.prepare(
      `${START_OVER} WHERE user_id IN (SELECT user_id FROM sync_docs WHERE ${plain})`,
    ),
    db.prepare(`DELETE FROM sync_docs WHERE ${plain}`),
  ]);
  return deleted?.meta.changes ?? 0;
}

/**
 * Saves each doc whose stored rev is its `baseRev`. Docs are independent: a
 * conflict on one doesn't stop the others. Results are in the push's order.
 * The account's key is made by its first push of a doc with a body.
 */
export async function pushDocs(
  data: UserData,
  userId: string,
  docs: readonly SyncPushDoc[],
  now: Date,
): Promise<SyncPushDocResult[]> {
  const { db } = data;
  const at = now.toISOString();
  const account = await data.accountKey(userId, {
    create: docs.some((d) => d.body !== null),
  });
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO sync_heads (user_id) VALUES (?1) ON CONFLICT DO NOTHING",
      )
      .bind(userId),
  ];
  for (const doc of docs) {
    const deleted = doc.body === null ? 1 : 0;
    const cas = [
      userId,
      doc.kind,
      doc.id,
      doc.baseRev,
      deleted,
      CAPS[doc.kind],
    ];
    const termId = doc.kind === "plan" && doc.body ? doc.body.termId : null;
    const body =
      doc.body === null
        ? null
        : await sealBody(account, doc.kind, doc.id, JSON.stringify(doc.body));
    statements.push(
      // What was stored when the decision was made, for a conflict's answer.
      db
        .prepare(
          `SELECT ${DOC_COLUMNS} FROM sync_docs WHERE user_id = ?1 AND kind = ?2 AND doc_id = ?3`,
        )
        .bind(userId, doc.kind, doc.id),
      db.prepare(BUMP_HEAD).bind(...cas),
      db.prepare(SAVE_DOC).bind(...cas, termId, body, at),
    );
  }
  const results = await db.batch(statements);
  const answers: SyncPushDocResult[] = [];
  const plain: SyncDocRow[] = [];
  for (const [i, doc] of docs.entries()) {
    const ref = { kind: doc.kind, id: doc.id };
    const before = results[1 + i * 3]?.results[0];
    const saved = results[3 + i * 3]?.results[0];
    if (saved) {
      answers.push({ ...ref, status: "ok", rev: SavedSchema.parse(saved).rev });
      continue;
    }
    const stored = before ? SyncDocRowSchema.parse(before) : null;
    if ((stored?.rev ?? 0) !== doc.baseRev) {
      // A plain-text body isn't an answer: it goes, as if pruned.
      const readable = stored && unsealed([stored]).length === 0;
      if (stored && !readable) plain.push(stored);
      answers.push({
        ...ref,
        status: "conflict",
        doc: readable ? syncDocFromRow(await openRow(account, stored)) : null,
      });
      continue;
    }
    // The base matched, so only its kind's cap can have stopped it.
    answers.push({ ...ref, status: "too-many-plans" });
  }
  if (plain.length > 0) await dropUnsealed(db, userId, plain);
  return answers;
}

/**
 * One page of docs saved after `since`, in rev order, or `reset` when the
 * cursor can't be continued: tombstones past it were pruned, it's ahead of
 * the account's head (the account was deleted and made again), or the
 * page held a body in plain text, which is deleted now.
 */
export async function pullDocs(
  data: UserData,
  userId: string,
  since: number,
): Promise<SyncPullResult> {
  const { db } = data;
  // One batch, so the head and the page are read at the same moment.
  const [heads, page] = await db.batch([
    db
      .prepare("SELECT head, pruned_through FROM sync_heads WHERE user_id = ?1")
      .bind(userId),
    db
      .prepare(
        `SELECT ${DOC_COLUMNS} FROM sync_docs WHERE user_id = ?1 AND rev > ?2
         ORDER BY rev LIMIT ?3`,
      )
      .bind(userId, since, SYNC_PULL_PAGE + 1),
  ]);
  const head = HeadSchema.parse(
    heads?.results[0] ?? { head: 0, pruned_through: 0 },
  );
  if (since > head.head) return { status: "reset" };
  // A device at 0 is pulling everything anyway: nothing it knew is missing.
  if (since > 0 && since < head.pruned_through) return { status: "reset" };
  const rows: SyncDocRow[] = (page?.results ?? []).map((r) =>
    SyncDocRowSchema.parse(r),
  );
  const shown = rows.slice(0, SYNC_PULL_PAGE);
  const plain = unsealed(shown);
  if (plain.length > 0) {
    await dropUnsealed(db, userId, plain);
    return { status: "reset" };
  }
  const account = shown.some((r) => r.body !== null)
    ? await data.accountKey(userId)
    : null;
  const docs = await Promise.all(
    shown.map(async (r) => syncDocFromRow(await openRow(account, r))),
  );
  return {
    status: "ok",
    cursor: docs.at(-1)?.rev ?? since,
    docs,
    more: rows.length > SYNC_PULL_PAGE,
  };
}

/**
 * Deletes tombstones saved more than SYNC_TOMBSTONE_DAYS ago, first raising
 * each affected user's `pruned_through`, so a device whose cursor is older
 * is told to pull everything again. Returns how many went.
 */
export async function pruneTombstones(
  db: D1Database,
  now: Date,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - SYNC_TOMBSTONE_DAYS * DAY_MS,
  ).toISOString();
  // One batch: a pull never sees the rows gone but the mark not raised.
  const [, pruned] = await db.batch([
    db
      .prepare(
        `UPDATE sync_heads SET pruned_through = MAX(
           pruned_through,
           (SELECT MAX(rev) FROM sync_docs d
            WHERE d.user_id = sync_heads.user_id
              AND d.deleted = 1 AND d.updated_at < ?1)
         )
         WHERE user_id IN (
           SELECT user_id FROM sync_docs WHERE deleted = 1 AND updated_at < ?1
         )`,
      )
      .bind(cutoff),
    db
      .prepare("DELETE FROM sync_docs WHERE deleted = 1 AND updated_at < ?1")
      .bind(cutoff),
  ]);
  return pruned?.meta.changes ?? 0;
}

// ---------- What Chat and the calendar feed read ----------

const BodyRowSchema = z.object({
  kind: SyncDocRowSchema.shape.kind,
  doc_id: z.string(),
  body: z.string(),
});

/**
 * Opens live rows' bodies and checks each against its kind's schema. A
 * plain-text body is left out, and deleted.
 */
async function openLive(
  data: UserData,
  userId: string,
  results: readonly unknown[],
): Promise<{ plans: Plan[]; settings: SettingsDoc | null }> {
  const all = results.map((r) => BodyRowSchema.parse(r));
  const plain = unsealed(all);
  if (plain.length > 0) await dropUnsealed(data.db, userId, plain);
  const rows = all.filter((r) => isSealed(r.body));
  const account = rows.length > 0 ? await data.accountKey(userId) : null;
  const plans: Plan[] = [];
  let settings: SettingsDoc | null = null;
  for (const row of rows) {
    const body: unknown = JSON.parse(
      await openBody(account, row.kind, row.doc_id, row.body),
    );
    if (row.kind === "plan") {
      const plan = PlanDocSchema.safeParse(body);
      if (plan.success) plans.push(plan.data);
    } else if (row.kind === "settings") {
      const parsed = SettingsDocSchema.safeParse(body);
      if (parsed.success) settings = parsed.data;
    }
  }
  return { plans, settings };
}

/** The person's live plans in these terms. */
export async function livePlans(
  data: UserData,
  userId: string,
  termIds: readonly TermId[],
): Promise<Plan[]> {
  if (termIds.length === 0) return [];
  const { results } = await data.db
    .prepare(
      `SELECT kind, doc_id, body FROM sync_docs
       WHERE user_id = ?1 AND kind = 'plan' AND deleted = 0
         AND term_id IN (SELECT value FROM json_each(?2))`,
    )
    .bind(userId, JSON.stringify(termIds))
    .all();
  return (await openLive(data, userId, results)).plans;
}

/** The person's settings doc, or null before its first save. */
export async function settingsDocOf(
  data: UserData,
  userId: string,
): Promise<SettingsDoc | null> {
  const { results } = await data.db
    .prepare(
      `SELECT kind, doc_id, body FROM sync_docs
       WHERE user_id = ?1 AND kind = 'settings' AND deleted = 0`,
    )
    .bind(userId)
    .all();
  return (await openLive(data, userId, results)).settings;
}

/** Each term's main plan, from the settings doc; none before its first save. */
export async function mainPlansOf(
  data: UserData,
  userId: string,
): Promise<MainPlans> {
  return (await settingsDocOf(data, userId))?.mainPlans ?? {};
}

const TermRowSchema = z.object({ term_id: z.string().nullable() });

/** The terms of these plans (live ones and tombstones). */
export async function termsOfPlans(
  db: D1Database,
  userId: string,
  planIds: readonly string[],
): Promise<TermId[]> {
  if (planIds.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT DISTINCT term_id FROM sync_docs
       WHERE user_id = ?1 AND kind = 'plan'
         AND doc_id IN (SELECT value FROM json_each(?2))`,
    )
    .bind(userId, JSON.stringify(planIds))
    .all();
  return results.flatMap((r) => TermRowSchema.parse(r).term_id ?? []);
}

const HeadOnlySchema = z.object({ head: RevSchema });

/**
 * The person's head rev, read in one moment with their live plans in these
 * terms and their settings doc: Chat rewrites its membership from them only
 * while the head is still the one read.
 */
export async function membershipDocs(
  data: UserData,
  userId: string,
  termIds: readonly TermId[],
): Promise<{ head: number; plans: Plan[]; settings: SettingsDoc | null }> {
  const { db } = data;
  const [head, docs] = await db.batch([
    db.prepare("SELECT head FROM sync_heads WHERE user_id = ?1").bind(userId),
    db
      .prepare(
        `SELECT kind, doc_id, body FROM sync_docs
         WHERE user_id = ?1 AND deleted = 0
           AND (kind = 'settings' OR term_id IN (SELECT value FROM json_each(?2)))`,
      )
      .bind(userId, JSON.stringify(termIds)),
  ]);
  return {
    head: HeadOnlySchema.parse(head?.results[0] ?? { head: 0 }).head,
    ...(await openLive(data, userId, docs?.results ?? [])),
  };
}
