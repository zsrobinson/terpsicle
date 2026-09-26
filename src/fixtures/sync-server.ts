// A plan sync server in memory, for the device engine's tests: the same
// rules as the Worker's (docs/V2.md §5.2–5.3, src/server/sync/store.ts), for
// one account. src/server/sync/fake-server.test.ts runs the same sequences
// against both and checks they answer alike.
import {
  type IsoDateTime,
  SYNC_MAX_PLANS,
  SYNC_PULL_PAGE,
  type SyncDoc,
  type SyncPullInput,
  type SyncPullResult,
  type SyncPushDocResult,
  type SyncPushInput,
  type SyncPushResult,
} from "~/core/schema";

const DAY_MS = 86_400_000;
const TOMBSTONE_DAYS = 30;

export class FakeSyncServer {
  /** The last rev handed out. */
  head = 0;
  /** Tombstones with a rev at or below this may be gone. */
  prunedThrough = 0;
  /** Every stored doc by `kind:id`. */
  readonly docs = new Map<string, SyncDoc>();
  /** Every push and pull, for tests that count calls. */
  readonly calls: (
    | { kind: "push"; input: SyncPushInput }
    | { kind: "pull"; input: SyncPullInput }
  )[] = [];

  constructor(private readonly clock: () => IsoDateTime) {}

  push(input: SyncPushInput): SyncPushResult {
    this.calls.push({ kind: "push", input });
    return {
      results: input.docs.map((doc): SyncPushDocResult => {
        const ref = { kind: doc.kind, id: doc.id };
        const key = `${doc.kind}:${doc.id}`;
        const stored = this.docs.get(key);
        if ((stored?.rev ?? 0) !== doc.baseRev)
          return { ...ref, status: "conflict", doc: stored ?? null };
        const live = (d: SyncDoc) => d.kind === "plan" && d.body !== null;
        if (
          doc.kind === "plan" &&
          doc.body !== null &&
          !(stored && live(stored)) &&
          [...this.docs.values()].filter(live).length >= SYNC_MAX_PLANS
        )
          return { ...ref, status: "too-many-plans" };
        const rev = ++this.head;
        const updatedAt = this.clock();
        const saved: SyncDoc =
          doc.kind === "plan"
            ? { kind: "plan", id: doc.id, rev, updatedAt, body: doc.body }
            : { kind: "settings", id: doc.id, rev, updatedAt, body: doc.body };
        this.docs.set(key, saved);
        return { ...ref, status: "ok", rev };
      }),
    };
  }

  pull(input: SyncPullInput): SyncPullResult {
    this.calls.push({ kind: "pull", input });
    const { since } = input;
    if (since > this.head) return { status: "reset" };
    if (since > 0 && since < this.prunedThrough) return { status: "reset" };
    const newer = [...this.docs.values()]
      .filter((d) => d.rev > since)
      .sort((a, b) => a.rev - b.rev);
    const docs = newer.slice(0, SYNC_PULL_PAGE);
    return {
      status: "ok",
      cursor: docs.at(-1)?.rev ?? since,
      docs,
      more: newer.length > SYNC_PULL_PAGE,
    };
  }

  /** The daily job: tombstones older than 30 days go. */
  prune(now: IsoDateTime): number {
    const cutoff = new Date(
      Date.parse(now) - TOMBSTONE_DAYS * DAY_MS,
    ).toISOString();
    let pruned = 0;
    for (const [key, doc] of this.docs) {
      if (doc.kind === "plan" && doc.body === null && doc.updatedAt < cutoff) {
        this.prunedThrough = Math.max(this.prunedThrough, doc.rev);
        this.docs.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  /** The account deleted and made again: revs start over. */
  wipe(): void {
    this.head = 0;
    this.prunedThrough = 0;
    this.docs.clear();
  }

  /** The live plans, by id. */
  plans(): Map<
    string,
    NonNullable<Extract<SyncDoc, { kind: "plan" }>["body"]>
  > {
    const out = new Map<
      string,
      NonNullable<Extract<SyncDoc, { kind: "plan" }>["body"]>
    >();
    for (const doc of this.docs.values())
      if (doc.kind === "plan" && doc.body) out.set(doc.id, doc.body);
    return out;
  }
}
