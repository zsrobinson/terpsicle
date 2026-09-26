import { z } from "zod";
import { LocalIdSchema } from "./primitives";
import {
  PlanDocSchema,
  RevSchema,
  SETTINGS_DOC_ID,
  SettingsDocSchema,
  type SyncDoc,
  SyncDocKindSchema,
  SyncDocSchema,
} from "./sync";

// The plan sync routes (docs/V2.md §5.3): `sync/push` saves docs with a
// per-doc rev compare-and-swap, `sync/pull` lists what changed since a
// cursor. The docs themselves are in ./sync.

/** A doc body, as JSON, is at most this many bytes. */
export const SYNC_MAX_BODY_BYTES = 65_536;
/** Docs in one push. */
export const SYNC_MAX_PUSH_DOCS = 50;
/** Plans a person can have on their account, not counting deleted ones. */
export const SYNC_MAX_PLANS = 200;
/** Docs in one pull page. */
export const SYNC_PULL_PAGE = 200;
/** Days a deleted plan's tombstone is kept before the daily job prunes it. */
export const SYNC_TOMBSTONE_DAYS = 30;
/**
 * The largest push request: every doc at its limit, plus room for the
 * envelope. A request over it is refused before it's parsed.
 */
export const SYNC_MAX_PUSH_REQUEST_BYTES =
  (SYNC_MAX_PUSH_DOCS + 1) * SYNC_MAX_BODY_BYTES;

const utf8 = new TextEncoder();

/** A body's size as the server stores it. */
export function syncBodyBytes(body: unknown): number {
  return body === null ? 0 : utf8.encode(JSON.stringify(body)).length;
}

const fitsBodyLimit = (d: { body: unknown }) =>
  syncBodyBytes(d.body) <= SYNC_MAX_BODY_BYTES;
const BODY_TOO_BIG = {
  message: `A doc is at most ${SYNC_MAX_BODY_BYTES} bytes`,
  path: ["body"],
};

// ---------- POST /api/sync/push ----------

/** One doc to save, based on the rev this device last saw (0: never saved). */
export const SyncPushDocSchema = z.discriminatedUnion("kind", [
  z
    .strictObject({
      kind: z.literal("plan"),
      id: LocalIdSchema,
      baseRev: RevSchema,
      /** null deletes the plan (a tombstone). */
      body: PlanDocSchema.nullable(),
    })
    .refine((d) => d.body === null || d.body.id === d.id, {
      message: "A plan doc's body must have the doc's id",
      path: ["body", "id"],
    })
    .refine(fitsBodyLimit, BODY_TOO_BIG),
  z
    .strictObject({
      kind: z.literal("settings"),
      id: z.literal(SETTINGS_DOC_ID),
      baseRev: RevSchema,
      /** The settings doc is never deleted. */
      body: SettingsDocSchema,
    })
    .refine(fitsBodyLimit, BODY_TOO_BIG),
]);
export type SyncPushDoc = z.infer<typeof SyncPushDocSchema>;

export const SyncPushInputSchema = z.strictObject({
  docs: z
    .array(SyncPushDocSchema)
    .min(1)
    .max(SYNC_MAX_PUSH_DOCS)
    .refine(
      (docs) =>
        new Set(docs.map((d) => `${d.kind}:${d.id}`)).size === docs.length,
      { message: "A doc appears twice in the push" },
    ),
});
export type SyncPushInput = z.infer<typeof SyncPushInputSchema>;

const docRef = { kind: SyncDocKindSchema, id: z.string() };

/** What happened to one pushed doc. Docs are independent. */
export const SyncPushDocResultSchema = z.discriminatedUnion("status", [
  /** Saved; the device now builds on `rev`. */
  z.object({ ...docRef, status: z.literal("ok"), rev: RevSchema.min(1) }),
  /**
   * The stored rev wasn't `baseRev`: `doc` is the server's current version
   * (V2 §5.4). null means nothing is stored under that id any more (a
   * tombstone pruned after 30 days), so the device treats it as deleted and
   * builds on rev 0.
   */
  z.object({
    ...docRef,
    status: z.literal("conflict"),
    doc: SyncDocSchema.nullable(),
  }),
  /**
   * Not saved: it would be a new plan past the account's SYNC_MAX_PLANS.
   * Nothing on the device changes; it can push again after deleting one.
   */
  z.object({ ...docRef, status: z.literal("too-many-plans") }),
]);
export type SyncPushDocResult = z.infer<typeof SyncPushDocResultSchema>;

export const SyncPushResultSchema = z.object({
  /** One per pushed doc, in the push's order. */
  results: z.array(SyncPushDocResultSchema),
});
export type SyncPushResult = z.infer<typeof SyncPushResultSchema>;

// ---------- POST /api/sync/pull ----------

export const SyncPullInputSchema = z.strictObject({
  /** The cursor from the last page (0: everything). */
  since: RevSchema,
});
export type SyncPullInput = z.infer<typeof SyncPullInputSchema>;

export const SyncPullResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    /** Pull from here next: the last doc's rev, or `since` when none. */
    cursor: RevSchema,
    /** Every doc (tombstones too) with a rev above `since`, ascending. */
    docs: z.array(SyncDocSchema).max(SYNC_PULL_PAGE),
    /** More pages wait: pull again from `cursor` now. */
    more: z.boolean(),
  }),
  /**
   * The cursor can't be continued: tombstones past it were pruned, or it's
   * ahead of the account (the account was deleted and made again). Pull
   * from 0 and treat it like a first sign-in (V2 §5.4).
   */
  z.object({ status: z.literal("reset") }),
]);
export type SyncPullResult = z.infer<typeof SyncPullResultSchema>;

// ---------- D1 (migrations/0005_sync.sql) ----------

/** A `sync_docs` row as the Worker reads it; `body` is still JSON text. */
export const SyncDocRowSchema = z.object({
  kind: SyncDocKindSchema,
  doc_id: z.string(),
  rev: z.number().int().min(1),
  deleted: z.union([z.literal(0), z.literal(1)]),
  body: z.string().nullable(),
  updated_at: z.string(),
});
export type SyncDocRow = z.infer<typeof SyncDocRowSchema>;

/** A stored row as the doc the API returns, checked against the doc schemas. */
export function syncDocFromRow(row: SyncDocRow): SyncDoc {
  return SyncDocSchema.parse({
    kind: row.kind,
    id: row.doc_id,
    rev: row.rev,
    updatedAt: row.updated_at,
    body: row.body === null ? null : JSON.parse(row.body),
  });
}
