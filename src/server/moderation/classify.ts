// The moderation pipeline without storage: rules first (no model), then
// Llama Guard, then the policy model for reviews and for chat the rules or
// Guard were unsure about. Any model failure, timeout, bad output or the
// daily cap holds the item; nothing is published without every check it
// needed. Pure apart from the model calls, so scripts/moderation-eval.ts runs
// exactly this against Workers AI over REST.
import {
  type ChatPolicy,
  DEFAULT_CHAT_POLICY,
  DEFAULT_GUARD_ACTIONS,
  DEFAULT_POLICY_THRESHOLDS,
  decide,
  type GuardActions,
  guardReasons,
  needsPolicy,
  type PolicyThresholds,
  policyLabelsFor,
  policyReasons,
  precheck,
} from "~/core/moderation";
import {
  type GuardAnswer,
  ModerationConfigOverridesSchema,
  type ModerationInput,
  type ModerationKind,
  type ModerationModels,
  type ModerationReason,
  type ModerationResult,
  type ModerationScores,
} from "~/core/schema";
import {
  type AiRunner,
  DEFAULT_HEDGE_AFTER_MS,
  DEFAULT_TIMEOUT_MS,
  GUARD_MODEL,
  type ModelFailure,
  POLICY_MODELS,
  runGuard,
  runPolicy,
} from "./models";

export interface ModerationConfig {
  guardModel: string;
  policyModels: Readonly<Record<ModerationKind, string>>;
  /** The longest one stage (Guard or policy) waits, across attempts. */
  timeoutMs: number;
  /** When a slow attempt gets a second one racing it. */
  hedgeAfterMs: number;
  guardActions: GuardActions;
  policyThresholds: PolicyThresholds;
  chatPolicy: ChatPolicy;
}

export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  guardModel: GUARD_MODEL,
  policyModels: POLICY_MODELS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  hedgeAfterMs: DEFAULT_HEDGE_AFTER_MS,
  guardActions: DEFAULT_GUARD_ACTIONS,
  policyThresholds: DEFAULT_POLICY_THRESHOLDS,
  chatPolicy: DEFAULT_CHAT_POLICY,
};

/** The defaults with MODERATION_CONFIG's overrides; invalid overrides are ignored. */
export function resolveConfig(raw: string | undefined): ModerationConfig {
  if (!raw) return DEFAULT_MODERATION_CONFIG;
  let parsed: ReturnType<typeof ModerationConfigOverridesSchema.safeParse>;
  try {
    parsed = ModerationConfigOverridesSchema.safeParse(JSON.parse(raw));
  } catch {
    console.warn({
      moderation: "MODERATION_CONFIG isn't JSON; using defaults",
    });
    return DEFAULT_MODERATION_CONFIG;
  }
  if (!parsed.success) {
    console.warn({
      moderation: "MODERATION_CONFIG is invalid; using defaults",
      issues: parsed.error.issues.map((i) => i.message),
    });
    return DEFAULT_MODERATION_CONFIG;
  }
  const o = parsed.data;
  return {
    guardModel: o.guardModel ?? GUARD_MODEL,
    policyModels: {
      review: o.policyModels?.review ?? o.policyModel ?? POLICY_MODELS.review,
      chat: o.policyModels?.chat ?? o.policyModel ?? POLICY_MODELS.chat,
    },
    timeoutMs: o.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    hedgeAfterMs: o.hedgeAfterMs ?? DEFAULT_HEDGE_AFTER_MS,
    guardActions: { ...DEFAULT_GUARD_ACTIONS, ...o.guardActions },
    policyThresholds: { ...DEFAULT_POLICY_THRESHOLDS, ...o.policyThresholds },
    chatPolicy: o.chatPolicy ?? DEFAULT_CHAT_POLICY,
  };
}

const systemHold = (failure: ModelFailure): ModerationReason => ({
  code: failure === "daily-cap" ? "daily-cap" : "model-unavailable",
  source: "system",
  action: "hold",
});

export interface ClassifyDeps {
  ai: AiRunner;
  config: ModerationConfig;
  /** Called before each model call (hedges included); false means the daily cap is spent. */
  budget: () => Promise<boolean>;
}

/** The result, plus what the decision log keeps (V2 §9.4). */
export interface Classified extends ModerationResult {
  /** Llama Guard's answer; null when it didn't run or didn't answer. */
  guard: GuardAnswer | null;
  /** Wall time for the model stages, ms. */
  latencyMs: number;
}

/**
 * The decision without touching D1: rules, then the models. Exported for the
 * eval script, which runs it against Workers AI over REST.
 */
export async function classify(
  input: ModerationInput,
  deps: ClassifyDeps,
): Promise<Classified> {
  const { kind, text, context } = input;
  const { config } = deps;
  const started = performance.now();
  const reasons = precheck({ kind, text, context });
  const model: ModerationModels = { guard: null, policy: null };
  let scores: ModerationScores = {};
  let guardAnswer: GuardAnswer | null = null;
  const result = (): Classified => ({
    decision: decide(reasons),
    reasons,
    model,
    scores,
    guard: guardAnswer,
    latencyMs: Math.round(performance.now() - started),
  });
  // A slur or a bad length decides it; no model can change that.
  if (decide(reasons) === "remove") return result();

  const options = (stage: keyof ModerationModels, id: string) => ({
    model: id,
    timeoutMs: config.timeoutMs,
    hedgeAfterMs: config.hedgeAfterMs,
    mayAttempt: async () => {
      const allowed = await deps.budget();
      if (allowed) model[stage] = id;
      return allowed;
    },
  });
  const guarded = () =>
    runGuard(deps.ai, text, options("guard", config.guardModel));
  const policed = () =>
    runPolicy(
      deps.ai,
      kind,
      text,
      context,
      options("policy", config.policyModels[kind]),
    );

  // When the policy model will read it anyway (every review, chat by
  // default, or chat the rules flagged), it runs beside Guard. Otherwise it
  // waits to see whether Guard flags anything.
  const policyEarly = needsPolicy(kind, reasons, config.chatPolicy)
    ? policed()
    : null;
  const guard = await guarded();
  if (guard.ok) {
    guardAnswer = guard.value;
    reasons.push(
      ...(guard.value.safe
        ? []
        : guard.value.categories.length > 0
          ? guardReasons(guard.value.categories, config.guardActions)
          : [{ code: "unsafe", source: "guard", action: "hold" } as const]),
    );
  } else reasons.push(systemHold(guard.failure));

  if (policyEarly || needsPolicy(kind, reasons, config.chatPolicy)) {
    // Decided before the policy's own reasons are added.
    const labels = policyLabelsFor(kind, reasons);
    const policy = await (policyEarly ?? policed());
    if (policy.ok) {
      scores = policy.value;
      reasons.push(
        ...policyReasons(kind, scores, config.policyThresholds, labels),
      );
    } else reasons.push(systemHold(policy.failure));
  }
  return result();
}
