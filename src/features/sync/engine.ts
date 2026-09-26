import {
  type IsoDateTime,
  type LocalId,
  type Plan,
  type SettingsDoc,
  SYNC_MAX_PUSH_DOCS,
  type SyncDoc,
  type SyncPullInput,
  type SyncPullResult,
  type SyncPushDoc,
  type SyncPushDocResult,
  SyncPushDocSchema,
  type SyncPushInput,
  type SyncPushResult,
} from "~/core/schema";
import {
  changedDocKeys,
  type DocKey,
  docBody,
  docKeyOf,
  docsInFlight,
  docsToPush,
  firstSignInUnion,
  hasUnsaved,
  isUntouchedPlan,
  mergeSettings,
  parseDocKey,
  planDocKey,
  planSyncReducer,
  plansAfterConflict,
  resolvePlanConflict,
  SETTINGS_DOC_KEY,
  type SyncedTables,
  sameJson,
  settingsDocOf,
  shouldApplyPulled,
  withSettingsDoc,
} from "~/core/sync";
import { ApiCallError } from "~/server/fns/api";
import type { RemoteChange } from "./remote-change";
import type { SyncStatus } from "./status";
import { markEdited, type SyncSnapshot, type SyncStorage } from "./storage";

// The device's half of plan sync (docs/V2.md §5.3): no op log, just a dirty
// flag per doc. An edit marks the docs it changed; they're pushed whole, with
// the rev they were based on, a second after the last change. Pulls run on
// start, when the tab comes back, and every minute while it's visible. A
// conflict is settled by core's rules (keep both plans, merge settings per
// key), and the first sign-in on a device joins its plans to the account's.
//
// Every step runs under one lock shared by the browser's tabs (Web Locks) and
// reads the flags from IndexedDB inside it, so two tabs never push the same
// change twice.

/** A push waits this long after the last change, so typing isn't a push per key. */
export const PUSH_DELAY_MS = 1_000;
/** Pull this often while the tab is visible. */
export const PULL_EVERY_MS = 60_000;
/** The first retry after a failure; each next one waits twice as long, up to the max. */
export const RETRY_MIN_MS = 2_000;
export const RETRY_MAX_MS = 60_000;

export interface SyncClient {
  push(input: SyncPushInput): Promise<SyncPushResult>;
  pull(input: SyncPullInput): Promise<SyncPullResult>;
}

/** What the person hears about (quietly: a toast, never a dialog). */
export type SyncNotice =
  | {
      kind: "first-sign-in";
      /** A cursor reset, not a sign-in: only worth a word if copies were made. */
      reset: boolean;
      /** This device's plans now on the account. */
      uploaded: number;
      /** The account's plans that weren't on this device. */
      fromAccount: number;
      renamed: readonly { from: string; to: string }[];
      copies: readonly { from: string; to: string }[];
    }
  /** Another device changed a plan this one had changed too: both are kept. */
  | { kind: "conflict-copy"; from: string; to: string }
  /** The account is at SYNC_MAX_PLANS: this device's new plans stay here. */
  | { kind: "too-many-plans" };

export interface SyncEngineOptions {
  userId: string;
  client: SyncClient;
  storage: SyncStorage;
  /** Shows a change from the account (the workspace store's `applyRemote`). */
  apply: (change: RemoteChange) => void;
  /**
   * Runs a write after every store change already queued for IndexedDB
   * (`Persistence.enqueue`), so a dirty flag never lands before its doc.
   */
  enqueue: (write: () => Promise<unknown>) => void;
  /** Waits for the store's queued writes (`Persistence.flushed`). */
  flushed: () => Promise<void>;
  /** Runs a step with no other tab's step running (Web Locks). */
  lock: <T>(task: () => Promise<T>) => Promise<T>;
  now: () => IsoDateTime;
  newId: () => LocalId;
  notify: (notice: SyncNotice) => void;
  status: (status: SyncStatus) => void;
  /** The session ended (the server said 401). The engine has stopped. */
  signedOut: () => void;
  /** Docs this tab changed from the account, so other tabs reload them. */
  changed?: (keys: readonly DocKey[]) => void;
  isVisible?: () => boolean;
  isOnline?: () => boolean;
}

type Step = "sync" | "push";

/** The change to the workspace between two versions of the synced tables. */
export function changeBetween(
  before: SyncedTables,
  after: SyncedTables,
): { change: RemoteChange; keys: DocKey[] } {
  const keys = changedDocKeys(before, after);
  const plans: [LocalId, Plan | null][] = [];
  let settings: SettingsDoc | undefined;
  for (const key of keys) {
    const parsed = parseDocKey(key);
    if (parsed.kind === "settings") settings = settingsDocOf(after);
    else
      plans.push([
        parsed.id,
        after.plans.find((p) => p.id === parsed.id) ?? null,
      ]);
  }
  return { change: { plans, ...(settings ? { settings } : {}) }, keys };
}

function withFlagsRemoved(
  s: SyncSnapshot,
  keys: readonly DocKey[],
): SyncSnapshot {
  if (keys.length === 0) return s;
  const docs = { ...s.sync.docs };
  for (const key of keys) delete docs[key];
  return { ...s, sync: { ...s.sync, docs } };
}

/** Pushes the page never heard back from (it closed mid-push): send again. */
/**
 * Before a reset's union: docs this device holds unchanged since it last
 * synced simply take the account's version, so only real edits here can
 * turn into copies. (A first sign-in has no such knowledge: it keeps both.)
 */
export function withCleanDocsPulled(
  s: SyncSnapshot,
  server: readonly SyncDoc[],
): SyncedTables {
  let tables = s.tables;
  for (const doc of server) {
    const flags = s.sync.docs[docKeyOf(doc)];
    if (!flags || flags.rev === 0 || flags.dirty || flags.inFlight) continue;
    tables =
      doc.kind === "settings"
        ? withSettingsDoc(tables, doc.body)
        : plansApplied(tables, doc.id, doc.body);
  }
  return tables;
}

export function recoverInFlight(s: SyncSnapshot): SyncSnapshot {
  const keys = docsInFlight(s.sync);
  if (keys.length === 0) return s;
  return { ...s, sync: planSyncReducer(s.sync, { type: "push-failed", keys }) };
}

/**
 * Pulled docs applied to the device: each replaces this device's version
 * unless it has unsaved changes here (dirty, in flight, or still being
 * written: `pending`), which its push's compare-and-swap will settle.
 *
 * A plan the app made on its own here (a default name, no courses, never
 * saved) goes when the account's plans arrive in its term, so a new device
 * doesn't end up with an empty "Plan A" beside the account's.
 */
export function applyPulled(
  s: SyncSnapshot,
  docs: readonly SyncDoc[],
  cursor: number,
  pending: ReadonlySet<DocKey>,
): SyncSnapshot {
  let tables = s.tables;
  let base = s.base;
  const applied: { key: DocKey; rev: number }[] = [];
  const terms = new Set<string>();
  for (const doc of docs) {
    const key = docKeyOf(doc);
    if (pending.has(key) || !shouldApplyPulled(s.sync, key, doc.rev)) continue;
    if (doc.kind === "settings") {
      tables = withSettingsDoc(tables, doc.body);
      base = doc.body;
    } else {
      tables = plansApplied(tables, doc.id, doc.body);
      if (doc.body) terms.add(doc.body.termId);
    }
    applied.push({ key, rev: doc.rev });
  }
  let next: SyncSnapshot = {
    ...s,
    tables,
    base,
    sync: planSyncReducer(s.sync, { type: "pulled", docs: applied, cursor }),
  };
  const fromAccount = new Set(applied.map((a) => a.key));
  const stray = next.tables.plans.filter((p) => {
    const key = planDocKey(p.id);
    const flags = next.sync.docs[key];
    return (
      terms.has(p.termId) &&
      !fromAccount.has(key) &&
      !pending.has(key) &&
      isUntouchedPlan(p) &&
      (flags === undefined ||
        (flags.rev === 0 && !flags.dirty && !flags.inFlight))
    );
  });
  if (stray.length > 0) {
    const gone = new Set(stray.map((p) => p.id));
    next = withFlagsRemoved(
      {
        ...next,
        tables: {
          ...next.tables,
          plans: next.tables.plans.filter((p) => !gone.has(p.id)),
        },
      },
      stray.map((p) => planDocKey(p.id)),
    );
  }
  return next;
}

function plansApplied(
  t: SyncedTables,
  id: LocalId,
  plan: Plan | null,
): SyncedTables {
  const plans = plansAfterConflict(t.plans, id, { kind: "take-server", plan });
  return plans === t.plans ? t : { ...t, plans };
}

/**
 * Picks the docs to push (up to SYNC_MAX_PUSH_DOCS) and marks them in
 * flight. A plan never saved and deleted here needs no push at all; a body
 * the API would refuse (too big) is `rejected` and waits for the next edit.
 */
export function startPush(
  s: SyncSnapshot,
  skip: ReadonlySet<DocKey>,
): {
  next: SyncSnapshot;
  docs: SyncPushDoc[];
  rejected: DocKey[];
} {
  const docs: SyncPushDoc[] = [];
  const rejected: DocKey[] = [];
  const unneeded: DocKey[] = [];
  for (const key of docsToPush(s.sync)) {
    if (skip.has(key)) continue;
    const baseRev = s.sync.docs[key]?.rev ?? 0;
    const parsed = parseDocKey(key);
    const body = docBody(s.tables, key);
    if (parsed.kind === "plan" && body === null && baseRev === 0) {
      unneeded.push(key);
      continue;
    }
    const doc = SyncPushDocSchema.safeParse(
      parsed.kind === "plan"
        ? { kind: "plan", id: parsed.id, baseRev, body }
        : { kind: "settings", id: SETTINGS_DOC_KEY, baseRev, body },
    );
    if (!doc.success) {
      rejected.push(key);
      continue;
    }
    if (docs.length < SYNC_MAX_PUSH_DOCS) docs.push(doc.data);
  }
  const keys = docs.map((d) => docKeyOf(d));
  const next = withFlagsRemoved(
    { ...s, sync: planSyncReducer(s.sync, { type: "push-started", keys }) },
    unneeded,
  );
  return { next, docs, rejected };
}

export interface PushOutcome {
  next: SyncSnapshot;
  /** Plans replaced or added here, and the settings doc if it changed. */
  change: RemoteChange;
  notices: SyncNotice[];
  /** Docs the account is too full for (SYNC_MAX_PLANS). */
  full: DocKey[];
}

/** The server's answers to a push, applied: saved revs, conflicts settled. */
export function applyPushResults(
  s: SyncSnapshot,
  sent: readonly SyncPushDoc[],
  results: readonly SyncPushDocResult[],
  ids: { newId: () => LocalId; now: IsoDateTime },
): PushOutcome {
  let { tables, sync, base } = s;
  const plans: [LocalId, Plan | null][] = [];
  let settings: SettingsDoc | undefined;
  const notices: SyncNotice[] = [];
  const full: DocKey[] = [];
  const answered = new Set<DocKey>();
  for (const result of results) {
    const key = docKeyOf(result);
    const doc = sent.find((d) => docKeyOf(d) === key);
    if (!doc || answered.has(key)) continue;
    answered.add(key);
    if (result.status === "ok") {
      sync = planSyncReducer(sync, {
        type: "push-accepted",
        key,
        rev: result.rev,
      });
      if (doc.kind === "settings") base = doc.body;
      continue;
    }
    if (result.status === "too-many-plans") {
      sync = planSyncReducer(sync, { type: "push-failed", keys: [key] });
      full.push(key);
      continue;
    }
    const server = result.doc;
    if (doc.kind === "settings") {
      if (server?.kind !== "settings") {
        sync = planSyncReducer(sync, {
          type: "push-conflict",
          key,
          rev: 0,
          pushAgain: true,
        });
        continue;
      }
      const merged = mergeSettings({
        base,
        local: settingsDocOf(tables),
        server: server.body,
      });
      tables = withSettingsDoc(tables, merged);
      settings = merged;
      base = server.body;
      sync = planSyncReducer(sync, {
        type: "push-conflict",
        key,
        rev: server.rev,
        pushAgain: !sameJson(merged, server.body),
      });
      continue;
    }
    const local = tables.plans.find((p) => p.id === doc.id) ?? null;
    if (server?.kind !== "plan") {
      // Nothing stored under that id any more (a pruned tombstone): it's
      // deleted there, so a plan still here is saved again as new.
      sync = planSyncReducer(sync, {
        type: "push-conflict",
        key,
        rev: 0,
        pushAgain: local !== null,
      });
      continue;
    }
    const conflict = resolvePlanConflict({
      local,
      server: server.body,
      plans: tables.plans,
      copyId: ids.newId(),
      now: ids.now,
    });
    const nextPlans = plansAfterConflict(tables.plans, doc.id, conflict);
    if (nextPlans !== tables.plans) tables = { ...tables, plans: nextPlans };
    if (conflict.kind !== "keep-local") plans.push([doc.id, conflict.plan]);
    if (conflict.kind === "keep-both") {
      plans.push([conflict.copy.id, conflict.copy]);
      notices.push({
        kind: "conflict-copy",
        from: conflict.plan.name,
        to: conflict.copy.name,
      });
    }
    sync = planSyncReducer(sync, {
      type: "push-conflict",
      key,
      rev: server.rev,
      pushAgain: conflict.kind === "keep-local",
      ...(conflict.kind === "keep-both"
        ? { copy: planDocKey(conflict.copy.id) }
        : {}),
    });
  }
  // A doc the answer left out wasn't saved: send it again.
  const unanswered = sent
    .map((d) => docKeyOf(d))
    .filter((k) => !answered.has(k));
  if (unanswered.length)
    sync = planSyncReducer(sync, { type: "push-failed", keys: unanswered });
  return {
    next: { ...s, tables, sync, base },
    change: { plans, ...(settings ? { settings } : {}) },
    notices,
    full,
  };
}

export class SyncEngine {
  private readonly o: SyncEngineOptions;
  /** Docs edited in the store whose dirty flag hasn't landed yet. */
  private readonly pending = new Map<DocKey, number>();
  /** New plans the account is too full for (SYNC_MAX_PLANS), until edited. */
  private readonly capped = new Set<DocKey>();
  /** Docs the API would refuse (too big), until edited. */
  private readonly refused = new Set<DocKey>();
  private queue: Promise<void> = Promise.resolve();
  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private pullTimer: ReturnType<typeof setInterval> | undefined;
  private failures = 0;
  private problem: "offline" | "error" | null = null;
  private stopped = false;

  constructor(options: SyncEngineOptions) {
    this.o = options;
  }

  /** Pulls (or joins the account on a first sign-in), then pushes. */
  start(): Promise<void> {
    this.o.status("saving");
    this.pullTimer = setInterval(() => {
      if (this.o.isVisible?.() ?? true) void this.sync();
    }, PULL_EVERY_MS);
    return this.sync();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.pushTimer);
    clearTimeout(this.retryTimer);
    clearInterval(this.pullTimer);
    this.o.status("off");
  }

  /** A pull, then a push: on start, when the tab comes back, when online, on retry. */
  sync(): Promise<void> {
    return this.run("sync");
  }

  /** Resolves once every step queued so far has finished. */
  idle(): Promise<void> {
    return this.queue;
  }

  /** Pushes everything dirty; true when nothing is left unsaved. */
  async flush(): Promise<boolean> {
    await this.o.flushed();
    await this.run("push");
    if (this.problem !== null || this.capped.size + this.refused.size > 0)
      return false;
    return !hasUnsaved((await this.o.storage.read()).sync);
  }

  /**
   * The person changed the workspace: marks the docs it touched dirty, once
   * the change itself is written, and pushes a second later.
   */
  noteEdit(prev: SyncedTables, next: SyncedTables): void {
    if (this.stopped) return;
    const before = new Set(prev.plans.map((p) => p.id));
    // A plan the app just made on its own isn't worth a push until it's
    // touched (the first sign-in skips those too, V2 §5.4).
    const untouched = new Set(
      next.plans
        .filter((p) => !before.has(p.id) && isUntouchedPlan(p))
        .map((p) => planDocKey(p.id)),
    );
    const keys = changedDocKeys(prev, next).filter((k) => !untouched.has(k));
    if (keys.length === 0) return;
    for (const key of keys) {
      this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
      this.capped.delete(key);
      this.refused.delete(key);
    }
    if (this.problem === null) this.o.status("saving");
    this.o.enqueue(async () => {
      try {
        await this.o.storage.update((s) => markEdited(s, keys));
      } finally {
        for (const key of keys) {
          const n = (this.pending.get(key) ?? 1) - 1;
          if (n > 0) this.pending.set(key, n);
          else this.pending.delete(key);
        }
      }
      this.schedulePush(PUSH_DELAY_MS);
    });
  }

  /** Another tab changed these docs from the account: show its version. */
  async reload(keys: readonly DocKey[]): Promise<void> {
    if (this.stopped) return;
    const { tables } = await this.o.storage.read();
    const plans: [LocalId, Plan | null][] = [];
    let settings: SettingsDoc | undefined;
    for (const key of keys) {
      if (this.pending.has(key)) continue;
      const parsed = parseDocKey(key);
      if (parsed.kind === "settings") settings = settingsDocOf(tables);
      else
        plans.push([
          parsed.id,
          tables.plans.find((p) => p.id === parsed.id) ?? null,
        ]);
    }
    this.o.apply({ plans, ...(settings ? { settings } : {}) });
  }

  private schedulePush(delay: number): void {
    if (this.stopped) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.run("push"), delay);
  }

  /** One step at a time in this tab, and under the lock across tabs. */
  private run(step: Step): Promise<void> {
    const task = this.queue.then(async () => {
      if (this.stopped) return;
      if (this.o.isOnline && !this.o.isOnline()) {
        this.problem = "offline";
        await this.report();
        return;
      }
      try {
        await this.o.lock(() => this.step(step));
        this.failures = 0;
        this.problem = null;
        clearTimeout(this.retryTimer);
      } catch (error) {
        this.fail(error);
      }
      await this.report();
    });
    this.queue = task.catch(() => {});
    return this.queue;
  }

  private async step(step: Step): Promise<void> {
    const { after } = await this.o.storage.update(recoverInFlight);
    if (after.userId !== this.o.userId) await this.joinAccount(false);
    else if (step === "sync") await this.pull(after.sync.cursor);
    await this.push();
  }

  private fail(error: unknown): void {
    const reason = error instanceof ApiCallError ? error.reason : "unknown";
    if (reason === "unauthorized") {
      this.stop();
      this.o.signedOut();
      return;
    }
    if (reason !== "network") console.error(error);
    this.problem = reason === "network" ? "offline" : "error";
    this.failures++;
    const backoff = Math.min(
      RETRY_MAX_MS,
      RETRY_MIN_MS * 2 ** (this.failures - 1),
    );
    const wait =
      error instanceof ApiCallError && error.retryAfterSeconds !== undefined
        ? error.retryAfterSeconds * 1_000
        : backoff;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.sync(), wait);
  }

  private async report(): Promise<void> {
    if (this.stopped) return;
    if (this.capped.size > 0) return this.o.status("full");
    if (this.problem) return this.o.status(this.problem);
    if (this.refused.size > 0) return this.o.status("error");
    const { sync } = await this.o.storage.read();
    this.o.status(
      hasUnsaved(sync) || this.pending.size > 0 ? "saving" : "saved",
    );
  }

  /** Shows a change from the account, except where this tab has unsaved edits. */
  private show(change: RemoteChange, keys: readonly DocKey[]): void {
    const plans = (change.plans ?? []).filter(
      ([id]) => !this.pending.has(planDocKey(id)),
    );
    const settings =
      change.settings && !this.pending.has(SETTINGS_DOC_KEY)
        ? change.settings
        : undefined;
    if (plans.length === 0 && !settings) return;
    this.o.apply({ plans, ...(settings ? { settings } : {}) });
    this.o.changed?.(keys);
  }

  private async pull(from: number): Promise<void> {
    let since = from;
    for (;;) {
      const page = await this.o.client.pull({ since });
      if (page.status === "reset") {
        await this.joinAccount(true);
        return;
      }
      const pending = new Set(this.pending.keys());
      const { before, after } = await this.o.storage.update((s) =>
        applyPulled(s, page.docs, page.cursor, pending),
      );
      const { change, keys } = changeBetween(before.tables, after.tables);
      this.show(change, keys);
      since = page.cursor;
      if (!page.more) return;
    }
  }

  private async push(): Promise<void> {
    // Bounded: each round saves something, but another device racing this
    // one could keep a conflict going; the next sync picks up the rest.
    for (let round = 0; round < 10; round++) {
      let sent: SyncPushDoc[] = [];
      await this.o.storage.update((s) => {
        const picked = startPush(s, new Set([...this.capped, ...this.refused]));
        for (const key of picked.rejected) {
          console.warn("Too big to save to the account", key);
          this.refused.add(key);
        }
        sent = picked.docs;
        return picked.next;
      });
      if (sent.length === 0) break;
      const docs = sent;
      let answer: SyncPushResult;
      try {
        answer = await this.o.client.push({ docs });
      } catch (error) {
        await this.o.storage.update((s) => ({
          ...s,
          sync: planSyncReducer(s.sync, {
            type: "push-failed",
            keys: docs.map((d) => docKeyOf(d)),
          }),
        }));
        throw error;
      }
      let outcome: PushOutcome | undefined;
      const now = this.o.now();
      const { before, after } = await this.o.storage.update((s) => {
        outcome = applyPushResults(s, docs, answer.results, {
          newId: this.o.newId,
          now,
        });
        return outcome.next;
      });
      if (!outcome) break;
      this.show(
        outcome.change,
        changeBetween(before.tables, after.tables).keys,
      );
      for (const notice of outcome.notices) this.o.notify(notice);
      if (outcome.full.length > 0) {
        if (this.capped.size === 0) this.o.notify({ kind: "too-many-plans" });
        for (const key of outcome.full) this.capped.add(key);
      }
    }
  }

  /**
   * The first sign-in on this device (or a pull the server can't continue):
   * everything on the account, joined with everything here (V2 §5.4).
   */
  private async joinAccount(reset: boolean): Promise<void> {
    await this.o.flushed();
    const server: SyncDoc[] = [];
    let cursor = 0;
    for (;;) {
      const page = await this.o.client.pull({ since: cursor });
      if (page.status === "reset") throw new ApiCallError("bad-response");
      server.push(...page.docs);
      cursor = page.cursor;
      if (!page.more) break;
    }
    let notice: SyncNotice | undefined;
    const now = this.o.now();
    const { before, after } = await this.o.storage.update((s) => {
      const result = firstSignInUnion({
        local: reset ? withCleanDocsPulled(s, server) : s.tables,
        server,
        cursor,
        newId: this.o.newId,
        now,
      });
      const name = (id: LocalId) =>
        s.tables.plans.find((p) => p.id === id)?.name ?? "";
      const accountIds = new Set(
        server.flatMap((d) => (d.kind === "plan" && d.body ? [d.id] : [])),
      );
      notice = {
        kind: "first-sign-in",
        reset,
        uploaded: result.uploaded.length,
        fromAccount: [...accountIds].filter(
          (id) => !s.tables.plans.some((p) => p.id === id),
        ).length,
        renamed: result.renamed.map(({ from, to }) => ({ from, to })),
        copies: result.copies.map(({ id, of }) => ({
          from: name(of),
          to: result.tables.plans.find((p) => p.id === id)?.name ?? "",
        })),
      };
      const settings = server.find((d) => d.kind === "settings");
      return {
        userId: this.o.userId,
        sync: result.sync,
        base: settings?.kind === "settings" ? settings.body : null,
        tables: result.tables,
      };
    });
    const { change, keys } = changeBetween(before.tables, after.tables);
    this.show(change, keys);
    if (notice) this.o.notify(notice);
  }
}
