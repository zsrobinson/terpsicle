// Turning reasons into a decision, and model outputs into reasons. Pure, so
// the thresholds are testable and the eval script and the Worker agree.
import type {
  GuardCategory,
  ModerationAction,
  ModerationDecision,
  ModerationKind,
  ModerationReason,
  ModerationScores,
  PolicyLabel,
  ReasonCode,
} from "~/core/schema";

/** The most severe action wins; flags never hold anything by themselves. */
export function decide(
  reasons: readonly ModerationReason[],
): ModerationDecision {
  if (reasons.some((r) => r.action === "remove")) return "remove";
  if (reasons.some((r) => r.action === "hold")) return "hold";
  return "publish";
}

/**
 * Whether the policy model should read this. Always for reviews (they're
 * few and each one matters); for chat only when something was flagged, to
 * keep a busy chat cheap.
 */
export function needsPolicy(
  kind: ModerationKind,
  reasons: readonly ModerationReason[],
): boolean {
  return kind === "review" || reasons.some((r) => r.action === "flag");
}

export const GUARD_CODES: Readonly<Record<GuardCategory, ReasonCode>> = {
  S1: "violence",
  S2: "crime",
  S3: "sex-crime",
  S4: "child-safety",
  S5: "defamation",
  S6: "specialized-advice",
  S7: "privacy",
  S8: "intellectual-property",
  S9: "weapons",
  S10: "hate",
  S11: "self-harm",
  S12: "sexual",
  S13: "elections",
  S14: "code-abuse",
};

export type GuardActions = Readonly<Record<GuardCategory, ModerationAction>>;

/**
 * What an unsafe verdict in each category does. Categories that often fire
 * on ordinary student complaints ("he basically robbed us of our grade" →
 * crime, "unfair and a liar" → defamation) only flag, so the policy model
 * judges them with the site's own rules instead of queueing every harsh
 * review.
 */
export const DEFAULT_GUARD_ACTIONS: GuardActions = {
  S1: "hold",
  S2: "flag",
  S3: "hold",
  S4: "remove",
  S5: "flag",
  S6: "flag",
  S7: "flag",
  S8: "flag",
  S9: "hold",
  S10: "hold",
  S11: "hold",
  S12: "hold",
  S13: "flag",
  S14: "flag",
};

export function guardReasons(
  categories: readonly GuardCategory[],
  actions: GuardActions = DEFAULT_GUARD_ACTIONS,
): ModerationReason[] {
  return [...new Set(categories)].map((category) => ({
    code: GUARD_CODES[category],
    source: "guard",
    action: actions[category],
    category,
  }));
}

export interface PolicyThreshold {
  /** Hold at or above this score. */
  hold: number;
  /** Remove at or above this score; unset means never remove automatically. */
  remove?: number;
}

export type PolicyThresholds = Readonly<Record<PolicyLabel, PolicyThreshold>>;

/**
 * Only clear spam and clear non-reviews are removed without a person. Every
 * other label holds: a wrong hold costs the owner a click, a wrong removal
 * silences someone.
 */
export const DEFAULT_POLICY_THRESHOLDS: PolicyThresholds = {
  "academic-integrity": { hold: 0.5 },
  "targets-person": { hold: 0.5 },
  "personal-info": { hold: 0.5 },
  "misconduct-claim": { hold: 0.5 },
  spam: { hold: 0.5, remove: 0.9 },
  "off-topic": { hold: 0.6, remove: 0.9 },
};

/** Labels the policy model scores for each kind. Chat can be off-topic. */
export const POLICY_LABELS: Readonly<Record<ModerationKind, PolicyLabel[]>> = {
  review: [
    "academic-integrity",
    "targets-person",
    "personal-info",
    "misconduct-claim",
    "spam",
    "off-topic",
  ],
  chat: ["academic-integrity", "targets-person", "personal-info", "spam"],
};

export function policyReasons(
  kind: ModerationKind,
  scores: ModerationScores,
  thresholds: PolicyThresholds = DEFAULT_POLICY_THRESHOLDS,
): ModerationReason[] {
  const reasons: ModerationReason[] = [];
  for (const label of POLICY_LABELS[kind]) {
    const score = scores[label];
    if (score === undefined) continue;
    const t = thresholds[label];
    const action: ModerationAction | null =
      t.remove !== undefined && score >= t.remove
        ? "remove"
        : score >= t.hold
          ? "hold"
          : null;
    if (action) reasons.push({ code: label, source: "policy", action, score });
  }
  return reasons;
}

/** Reasons that put a held item at the top of the owner's queue. */
export const URGENT_CODES: ReadonlySet<ReasonCode> = new Set([
  "violence",
  "weapons",
  "self-harm",
  "child-safety",
  "sex-crime",
]);

export const isUrgent = (reasons: readonly ModerationReason[]) =>
  reasons.some((r) => URGENT_CODES.has(r.code) && r.action !== "flag");
