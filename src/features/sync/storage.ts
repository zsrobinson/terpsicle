import {
  BlockSchema,
  ChatPlansSchema,
  CourseColorPrefSchema,
  DEFAULT_TRAVEL_SETTINGS,
  type LocalSyncDoc,
  LocalSyncDocSchema,
  LocalSyncMetaSchema,
  PlanSchema,
  type SettingsDoc,
  TravelSettingsSchema,
  validRows,
} from "~/core/schema";
import {
  type DocKey,
  type DocSync,
  INITIAL_PLAN_SYNC_STATE,
  type PlanSyncState,
  planSyncReducer,
  SETTINGS_DOC_KEY,
  type SyncedTables,
  sameJson,
} from "~/core/sync";
// Types only: this chunk loads lazily, and signing out loads it on any page,
// so it imports no scheduler modules (scripts/check-bundle.ts).
import type { TerpsicleDb } from "~/state/db";

// Where plan sync keeps its state on the device (Dexie v2, DATA.md §5): the
// synced tables themselves, each doc's flags (`syncDocs`), the settings doc's
// `base`, and the `sync` row (account and cursor). The engine reads and
// writes all of it in one transaction per step, so two tabs never act on a
// stale view: IndexedDB runs read-write transactions over the same tables
// one at a time, across tabs too.

/** Everything plan sync knows on this device, at one moment. */
export interface SyncSnapshot {
  /** Whose account the flags and cursor belong to; null before any sign-in. */
  readonly userId: string | null;
  readonly sync: PlanSyncState;
  /** The settings doc as last saved or pulled (V2 §5.4); null before the first. */
  readonly base: SettingsDoc | null;
  readonly tables: SyncedTables;
}

export interface SyncStorage {
  read(): Promise<SyncSnapshot>;
  /**
   * Reads the snapshot, applies `step` (pure, synchronous) and writes back
   * what changed, all in one transaction.
   */
  update(
    step: (s: SyncSnapshot) => SyncSnapshot,
  ): Promise<{ before: SyncSnapshot; after: SyncSnapshot }>;
  /** Forgets the account (flags, cursor, base). Plans stay. */
  clearSync(): Promise<void>;
  /** Removes plans, blocks, colors, travel and chat plans too (sign out and remove). */
  clearAll(): Promise<void>;
}

export const EMPTY_TABLES: SyncedTables = {
  plans: [],
  blocks: [],
  colors: {},
  travel: DEFAULT_TRAVEL_SETTINGS,
  chatPlans: {},
};

export const EMPTY_SNAPSHOT: SyncSnapshot = {
  userId: null,
  sync: INITIAL_PLAN_SYNC_STATE,
  base: null,
  tables: EMPTY_TABLES,
};

/** Marks docs edited on this device: dirty, based on whatever rev they had. */
export function markEdited(
  s: SyncSnapshot,
  keys: readonly DocKey[],
): SyncSnapshot {
  const sync = planSyncReducer(s.sync, { type: "edited", keys });
  return sync === s.sync ? s : { ...s, sync };
}

/**
 * Rows to put and ids to delete between two versions of a table. Rows that
 * didn't change keep their identity through core's functions.
 */
function rowChanges<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
): { put: T[]; remove: string[] } {
  const was = new Set(before);
  const ids = new Set(after.map((row) => row.id));
  return {
    put: after.filter((row) => !was.has(row)),
    remove: before.filter((row) => !ids.has(row.id)).map((row) => row.id),
  };
}

function sameFlags(a: DocSync | undefined, b: DocSync | undefined): boolean {
  return (
    a?.rev === b?.rev && a?.dirty === b?.dirty && a?.inFlight === b?.inFlight
  );
}

// ---------- Dexie ----------

const SETTINGS_SYNC_ROW = "sync";

export function dexieSyncStorage(db: TerpsicleDb): SyncStorage {
  const tables = [
    db.plans,
    db.blocks,
    db.courseColors,
    db.settings,
    db.syncDocs,
  ];

  async function readInTx(): Promise<SyncSnapshot> {
    const [plans, blocks, colors, settings, docs] = await Promise.all([
      db.plans.toArray(),
      db.blocks.toArray(),
      db.courseColors.toArray(),
      db.settings.bulkGet(["travel", "chatPlans", SETTINGS_SYNC_ROW]),
      db.syncDocs.toArray(),
    ]);
    const [travelRow, chatPlansRow, syncRow] = settings;
    const travel = TravelSettingsSchema.safeParse(travelRow?.value);
    const chatPlans = ChatPlansSchema.safeParse(chatPlansRow?.value);
    const meta = LocalSyncMetaSchema.safeParse(syncRow?.value);
    const flags: Partial<Record<DocKey, DocSync>> = {};
    let base: SettingsDoc | null = null;
    for (const row of validRows("syncDocs", LocalSyncDocSchema, docs)) {
      flags[row.key] = {
        rev: row.rev,
        dirty: row.dirty,
        inFlight: row.inFlight,
      };
      if (row.key === SETTINGS_DOC_KEY) base = row.base ?? null;
    }
    return {
      userId: meta.success ? meta.data.userId : null,
      sync: { cursor: meta.success ? meta.data.cursor : 0, docs: flags },
      base,
      tables: {
        plans: validRows("plans", PlanSchema, plans),
        blocks: validRows("blocks", BlockSchema, blocks),
        colors: Object.fromEntries(
          validRows("courseColors", CourseColorPrefSchema, colors).map((c) => [
            c.courseCode,
            c.color,
          ]),
        ),
        travel: travel.success ? travel.data : DEFAULT_TRAVEL_SETTINGS,
        chatPlans: chatPlans.success ? chatPlans.data : {},
      },
    };
  }

  async function writeInTx(
    before: SyncSnapshot,
    after: SyncSnapshot,
  ): Promise<void> {
    const a = after.tables;
    const b = before.tables;
    if (a.plans !== b.plans) {
      const { put, remove } = rowChanges(b.plans, a.plans);
      if (put.length) await db.plans.bulkPut(put);
      if (remove.length) await db.plans.bulkDelete(remove);
    }
    if (a.blocks !== b.blocks) {
      const { put, remove } = rowChanges(b.blocks, a.blocks);
      if (put.length) await db.blocks.bulkPut(put);
      if (remove.length) await db.blocks.bulkDelete(remove);
    }
    if (a.colors !== b.colors) {
      await db.courseColors.clear();
      await db.courseColors.bulkPut(
        Object.entries(a.colors).map(([courseCode, color]) => ({
          courseCode,
          color,
        })),
      );
    }
    if (a.travel !== b.travel)
      await db.settings.put({ key: "travel", value: a.travel });
    if (a.chatPlans !== b.chatPlans)
      await db.settings.put({ key: "chatPlans", value: { ...a.chatPlans } });

    const rows: LocalSyncDoc[] = [];
    const removed: DocKey[] = [];
    const keys = new Set([
      ...(Object.keys(before.sync.docs) as DocKey[]),
      ...(Object.keys(after.sync.docs) as DocKey[]),
    ]);
    for (const key of keys) {
      const next = after.sync.docs[key];
      const baseChanged =
        key === SETTINGS_DOC_KEY && !sameJson(before.base, after.base);
      if (!next) {
        if (before.sync.docs[key]) removed.push(key);
      } else if (!sameFlags(before.sync.docs[key], next) || baseChanged) {
        rows.push({
          key,
          ...next,
          ...(key === SETTINGS_DOC_KEY ? { base: after.base } : {}),
        });
      }
    }
    if (rows.length) await db.syncDocs.bulkPut(rows);
    if (removed.length) await db.syncDocs.bulkDelete(removed);

    if (after.userId === null) {
      if (before.userId !== null) await db.settings.delete(SETTINGS_SYNC_ROW);
    } else if (
      after.userId !== before.userId ||
      after.sync.cursor !== before.sync.cursor
    ) {
      await db.settings.put({
        key: SETTINGS_SYNC_ROW,
        value: { userId: after.userId, cursor: after.sync.cursor },
      });
    }
  }

  return {
    read: () => db.transaction("r", tables, readInTx),
    update: (step) =>
      db.transaction("rw", tables, async () => {
        const before = await readInTx();
        const after = step(before);
        if (after !== before) await writeInTx(before, after);
        return { before, after };
      }),
    clearSync: () =>
      db.transaction("rw", [db.settings, db.syncDocs], async () => {
        await db.syncDocs.clear();
        await db.settings.delete(SETTINGS_SYNC_ROW);
      }),
    clearAll: () =>
      db.transaction("rw", tables, async () => {
        await Promise.all([
          db.plans.clear(),
          db.blocks.clear(),
          db.courseColors.clear(),
          db.syncDocs.clear(),
          db.settings.bulkDelete(["travel", "chatPlans", SETTINGS_SYNC_ROW]),
        ]);
      }),
  };
}

// ---------- in memory (tests) ----------

/** A device's storage in memory: for the engine's tests. */
export function memorySyncStorage(
  initial: SyncSnapshot = EMPTY_SNAPSHOT,
): SyncStorage & { snapshot: SyncSnapshot } {
  const storage = {
    snapshot: initial,
    read: async () => storage.snapshot,
    update: async (step: (s: SyncSnapshot) => SyncSnapshot) => {
      const before = storage.snapshot;
      const after = step(before);
      storage.snapshot = after;
      return { before, after };
    },
    clearSync: async () => {
      storage.snapshot = {
        ...storage.snapshot,
        userId: null,
        sync: INITIAL_PLAN_SYNC_STATE,
        base: null,
      };
    },
    clearAll: async () => {
      storage.snapshot = EMPTY_SNAPSHOT;
    },
  };
  return storage;
}
