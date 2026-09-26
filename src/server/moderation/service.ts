// moderate(): the one entry point Reviews and Chat call before showing
// anything a person wrote. It runs the pipeline in classify.ts, records the
// decision (never the author), and queues held items. Items held only
// because a check couldn't run wait as `retry`, and retryHeld() (every 5
// minutes, src/jobs/moderation.ts) screens them again before the owner ever
// sees them. API and flow: docs/MODERATION.md.
import { isUrgent, needsRetry } from "~/core/moderation";
import {
  type CourseCode,
  type ModerationDecision,
  type ModerationInput,
  ModerationInputSchema,
  type ModerationKind,
  type ModerationReason,
  type ModerationResult,
  type QueueSnapshot,
} from "~/core/schema";
import { hit } from "../counters";
import {
  type Classified,
  classify,
  type ModerationConfig,
  resolveConfig,
} from "./classify";
import { MODERATION_HANDLERS, type ModerationHandlers } from "./handlers";
import {
  autoVerdict,
  blankOldSnapshots,
  decisionOf,
  decisionsFor,
  deleteQueueRow,
  dropWaitingQueueItem,
  getWaitingRow,
  insertDecision,
  listRetryRows,
  queueOpenItem,
  setQueueStatus,
  updateRetryRow,
  upsertQueueItem,
} from "./store";

export interface ModerationEnv {
  DB: D1Database;
  AI: Ai;
  /** Model calls per UTC day, at most (Workers AI cost). */
  MODERATION_DAILY_CAP?: string;
  /** Optional JSON overrides for models and thresholds (ModerationConfigOverridesSchema). */
  MODERATION_CONFIG?: string;
}

/** V2 §13. Every attempt counts, hedges and retries included. */
export const DEFAULT_DAILY_CAP = 2_000;
const CAP_COUNTER = "moderation";

/**
 * Automatic re-screens before a failed check goes to the owner. The cron
 * runs every 5 minutes, so the first comes within 5 minutes and the last
 * within 10; two ride out a short Workers AI blip.
 */
export const MAX_RETRIES = 2;
/** Retry rows screened per cron run, to bound its wall time. */
const RETRY_BATCH = 25;

export interface ModerationDeps {
  now: Date;
  /** Overrides MODERATION_CONFIG, for tests. */
  config?: ModerationConfig;
}

function classifier(env: ModerationEnv, deps: ModerationDeps) {
  const cap =
    Number(env.MODERATION_DAILY_CAP ?? DEFAULT_DAILY_CAP) || DEFAULT_DAILY_CAP;
  const config = deps.config ?? resolveConfig(env.MODERATION_CONFIG);
  return (input: ModerationInput) =>
    classify(input, {
      ai: env.AI,
      config,
      budget: async () =>
        (await hit(env.DB, CAP_COUNTER, { seconds: 86_400 }, deps.now)) <= cap,
    });
}

const publicResult = (c: Classified): ModerationResult => ({
  decision: c.decision,
  reasons: c.reasons,
  model: c.model,
  scores: c.scores,
});

function decisionStatement(
  env: ModerationEnv,
  surface: ModerationKind,
  ref: string,
  c: Classified,
  now: Date,
): D1PreparedStatement {
  const ranModels = c.model.guard !== null || c.model.policy !== null;
  return insertDecision(env.DB, {
    surface,
    ref,
    stage: ranModels ? "model" : "rules",
    verdict: autoVerdict(c.decision),
    labels: c.reasons,
    guard: c.guard,
    policy: c.model.policy ? c.scores : null,
    models: ranModels ? c.model : null,
    latencyMs: ranModels ? c.latencyMs : null,
    decidedBy: "system",
    reason: null,
    now,
  });
}

/**
 * Decides whether `text` can be shown, records the decision (never the
 * author), and queues held items. Throws only when the input is malformed
 * or D1 fails; model trouble becomes a hold, retried automatically.
 */
export async function moderate(
  env: ModerationEnv,
  input: ModerationInput,
  deps: ModerationDeps,
): Promise<ModerationResult> {
  const parsed = ModerationInputSchema.parse(input);
  const { kind, text, context } = parsed;
  const c = await classifier(env, deps)(parsed);
  const snapshot: QueueSnapshot = {
    text,
    course: context.course ?? null,
    activeAssignments: context.activeAssignments ?? false,
    scores: c.scores,
    retries: 0,
  };
  await env.DB.batch([
    decisionStatement(env, kind, context.targetId, c, deps.now),
    c.decision === "hold"
      ? upsertQueueItem(env.DB, {
          surface: kind,
          ref: context.targetId,
          snapshot,
          labels: c.reasons,
          urgent: isUrgent(c.reasons),
          status: needsRetry(c.reasons) ? "retry" : "open",
          now: deps.now,
        })
      : dropWaitingQueueItem(env.DB, kind, context.targetId),
  ]);
  return publicResult(c);
}

/** Something a feature sends to the owner without a model deciding it. */
export interface OwnerItem {
  kind: ModerationKind;
  targetId: string;
  /** What readers see (or would see): the snapshot for a new queue row. */
  text: string;
  course: CourseCode | null;
  /** Why: `reported` from reports, `burst` from Reviews' limits. */
  reasons: readonly ModerationReason[];
  urgent: boolean;
}

const reasonKey = (r: ModerationReason) =>
  `${r.code}|${r.source}|${r.report ?? ""}|${r.category ?? ""}`;

/** Old labels with new ones added; a newer label replaces its same-kind twin. */
function mergeReasons(
  old: readonly ModerationReason[],
  added: readonly ModerationReason[],
): ModerationReason[] {
  const merged = new Map(old.map((r) => [reasonKey(r), r]));
  for (const r of added) merged.set(reasonKey(r), r);
  return [...merged.values()];
}

/**
 * Puts an item in the owner's queue for a reason that isn't the text's:
 * readers reported it (V2 §9.3), or Reviews saw a burst (V2 §7.4). An item
 * already waiting keeps its place and snapshot, gains the reasons, and
 * becomes the owner's (a retry wouldn't answer a report). `decision` also
 * logs what the feature did: `hide` when reports took it down, `hold` for a
 * burst. Like moderate(), nothing here names an author.
 */
export async function queueForOwner(
  env: Pick<ModerationEnv, "DB">,
  item: OwnerItem,
  deps: {
    now: Date;
    decision?: { stage: "rules" | "reports"; verdict: "hold" | "hide" };
  },
): Promise<void> {
  const waiting = await getWaitingRow(env.DB, item.kind, item.targetId);
  const labels = mergeReasons(waiting?.labels ?? [], item.reasons);
  const statements = [
    queueOpenItem(env.DB, {
      surface: item.kind,
      ref: item.targetId,
      snapshot: {
        text: item.text,
        course: item.course,
        activeAssignments: false,
        scores: {},
        retries: 0,
      },
      labels,
      urgent: item.urgent || isUrgent(item.reasons),
      now: deps.now,
    }),
  ];
  if (deps.decision)
    statements.push(
      insertDecision(env.DB, {
        surface: item.kind,
        ref: item.targetId,
        stage: deps.decision.stage,
        verdict: deps.decision.verdict,
        labels: item.reasons,
        guard: null,
        policy: null,
        models: null,
        latencyMs: null,
        decidedBy: "system",
        reason: null,
        now: deps.now,
      }),
    );
  await env.DB.batch(statements);
}

/**
 * Takes an item out of the queue because it's gone (its author deleted it).
 * The decision log keeps its history.
 */
export async function withdrawFromQueue(
  db: D1Database,
  kind: ModerationKind,
  targetId: string,
): Promise<void> {
  await dropWaitingQueueItem(db, kind, targetId).run();
}

export interface RetryReport {
  retried: number;
  published: number;
  removed: number;
  /** Held for a real reason, or still failing after MAX_RETRIES: now the owner's. */
  toOwner: number;
  /** Still failing; tried again next run. */
  waiting: number;
  /** The owning feature's handler threw; left as it was, tried again next run. */
  handlerErrors: number;
}

/**
 * Screens `retry` items again. A post that passes is published (and never
 * reached the owner); one that fails a real check, or keeps hitting a
 * failed check MAX_RETRIES times, goes to the owner's queue.
 */
export async function retryHeld(
  env: ModerationEnv,
  deps: ModerationDeps & { handlers?: ModerationHandlers },
): Promise<RetryReport> {
  const handlers = deps.handlers ?? MODERATION_HANDLERS;
  const report: RetryReport = {
    retried: 0,
    published: 0,
    removed: 0,
    toOwner: 0,
    waiting: 0,
    handlerErrors: 0,
  };
  const screen = classifier(env, deps);
  for (const row of await listRetryRows(env.DB, RETRY_BATCH)) {
    // Only closed items are ever blanked, so this can't happen; if it does,
    // there's nothing to screen and the owner decides.
    if (!row.snapshot) {
      await setQueueStatus(env.DB, row.id, "open", null).run();
      report.toOwner++;
      continue;
    }
    report.retried++;
    const s = row.snapshot;
    const c = await screen({
      kind: row.surface,
      text: s.text,
      context: {
        targetId: row.ref,
        ...(s.course ? { course: s.course } : {}),
        activeAssignments: s.activeAssignments,
      },
    });
    if (c.decision !== "hold") {
      try {
        await handlers[row.surface]?.(row.ref, c.decision, {
          db: env.DB,
          now: deps.now,
          reasons: c.reasons,
        });
      } catch (error) {
        console.warn({
          moderation: "retry handler error",
          surface: row.surface,
          error: String(error),
        });
        report.handlerErrors++;
        continue;
      }
      await env.DB.batch([
        decisionStatement(env, row.surface, row.ref, c, deps.now),
        deleteQueueRow(env.DB, row.id),
      ]);
      if (c.decision === "publish") report.published++;
      else report.removed++;
      continue;
    }
    const retries = s.retries + 1;
    const stillFailing = needsRetry(c.reasons);
    const status = stillFailing && retries < MAX_RETRIES ? "retry" : "open";
    await env.DB.batch([
      decisionStatement(env, row.surface, row.ref, c, deps.now),
      updateRetryRow(env.DB, row.id, {
        status,
        snapshot: { ...s, scores: c.scores, retries },
        labels: c.reasons,
        urgent: isUrgent(c.reasons),
      }),
    ]);
    if (status === "open") report.toOwner++;
    else report.waiting++;
  }
  return report;
}

/** Blanks held text 30 days after its item closed (V2 §9.4). */
export const blankClosedSnapshots = (env: ModerationEnv, now: Date) =>
  blankOldSnapshots(env.DB, now);

/**
 * The item's current state: the latest decision, automatic or the owner's.
 * Null when it was never moderated. Features can read this instead of
 * keeping their own copy.
 */
export async function currentDecision(
  db: D1Database,
  kind: ModerationKind,
  targetId: string,
): Promise<ModerationDecision | null> {
  const decisions = await decisionsFor(db, kind, targetId);
  const latest = decisions.at(-1);
  return latest ? decisionOf(latest.verdict) : null;
}
