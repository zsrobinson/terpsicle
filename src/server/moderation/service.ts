// moderate(): the one entry point Reviews and Chat call before showing
// anything a person wrote. It runs the pipeline in classify.ts, records the
// decision (never the author), and queues held items for the owner.
// API and flow: docs/MODERATION.md.
import { isUrgent } from "~/core/moderation";
import {
  type ModerationDecision,
  type ModerationInput,
  ModerationInputSchema,
  type ModerationResult,
} from "~/core/schema";
import { hit } from "../counters";
import { classify, type ModerationConfig, resolveConfig } from "./classify";
import {
  decisionsFor,
  dropPendingQueueItem,
  insertDecision,
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

export const DEFAULT_DAILY_CAP = 5_000;
const CAP_COUNTER = "moderation";

export interface ModerationDeps {
  now: Date;
  /** Overrides MODERATION_CONFIG, for tests. */
  config?: ModerationConfig;
}

/**
 * Decides whether `text` can be shown, records the decision (never the
 * author), and queues held items for the owner. Throws only when the input
 * is malformed or D1 fails; model trouble becomes a hold.
 */
export async function moderate(
  env: ModerationEnv,
  input: ModerationInput,
  deps: ModerationDeps,
): Promise<ModerationResult> {
  const { kind, text, context } = ModerationInputSchema.parse(input);
  const cap =
    Number(env.MODERATION_DAILY_CAP ?? DEFAULT_DAILY_CAP) || DEFAULT_DAILY_CAP;
  const result = await classify(
    { kind, text, context },
    {
      ai: env.AI,
      config: deps.config ?? resolveConfig(env.MODERATION_CONFIG),
      budget: async () =>
        (await hit(env.DB, CAP_COUNTER, { seconds: 86_400 }, deps.now)) <= cap,
    },
  );

  const statements = [
    insertDecision(env.DB, {
      kind,
      targetId: context.targetId,
      decision: result.decision,
      actor: "auto",
      reasons: result.reasons,
      models: result.model,
      scores: result.scores,
      now: deps.now,
    }),
    result.decision === "hold"
      ? upsertQueueItem(env.DB, {
          kind,
          targetId: context.targetId,
          course: context.course ?? null,
          text,
          reasons: result.reasons,
          scores: result.scores,
          urgent: isUrgent(result.reasons),
          now: deps.now,
        })
      : dropPendingQueueItem(env.DB, kind, context.targetId),
  ];
  await env.DB.batch(statements);
  return result;
}

/**
 * The item's current state: the latest decision, automatic or the owner's.
 * Null when it was never moderated. Features can read this instead of
 * keeping their own copy.
 */
export async function currentDecision(
  db: D1Database,
  kind: ModerationInput["kind"],
  targetId: string,
): Promise<ModerationDecision | null> {
  const decisions = await decisionsFor(db, kind, targetId);
  return decisions.at(-1)?.decision ?? null;
}
