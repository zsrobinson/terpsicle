// The moderation pipeline without storage: rules first (no model), then
// Llama Guard, then the policy model for reviews and for chat the rules or
// Guard were unsure about. Any model failure, timeout, bad output or the
// daily cap holds the item; nothing is published without every check it
// needed. Pure apart from the model calls, so scripts/moderation-eval.ts runs
// exactly this against Workers AI over REST.
import {
  DEFAULT_GUARD_ACTIONS,
  DEFAULT_POLICY_THRESHOLDS,
  decide,
  type GuardActions,
  guardReasons,
  needsPolicy,
  type PolicyThresholds,
  policyReasons,
  precheck,
} from "~/core/moderation";
import {
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
}

export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  guardModel: GUARD_MODEL,
  policyModels: POLICY_MODELS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  hedgeAfterMs: DEFAULT_HEDGE_AFTER_MS,
  guardActions: DEFAULT_GUARD_ACTIONS,
  policyThresholds: DEFAULT_POLICY_THRESHOLDS,
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

/**
 * The decision without touching D1: rules, then the models. Exported for the
 * eval script, which runs it against Workers AI over REST.
 */
export async function classify(
  input: ModerationInput,
  deps: ClassifyDeps,
): Promise<ModerationResult> {
  const { kind, text, context } = input;
  const { config } = deps;
  const reasons = precheck({ kind, text, context });
  const model: ModerationModels = { guard: null, policy: null };
  let scores: ModerationScores = {};
  const result = (): ModerationResult => ({
    decision: decide(reasons),
    reasons,
    model,
    scores,
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

  // Reviews always get both, so run them side by side. Chat asks the policy
  // model only when the rules or Guard flagged something.
  const policyEarly = kind === "review" ? policed() : null;
  const guard = await guarded();
  if (guard.ok)
    reasons.push(
      ...(guard.value.safe
        ? []
        : guard.value.categories.length > 0
          ? guardReasons(guard.value.categories, config.guardActions)
          : [{ code: "unsafe", source: "guard", action: "hold" } as const]),
    );
  else reasons.push(systemHold(guard.failure));

  if (policyEarly || needsPolicy(kind, reasons)) {
    const policy = await (policyEarly ?? policed());
    if (policy.ok) {
      scores = policy.value;
      reasons.push(...policyReasons(kind, scores, config.policyThresholds));
    } else reasons.push(systemHold(policy.failure));
  }
  return result();
}
