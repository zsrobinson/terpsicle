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
import { findContacts } from "./contact";

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
 * few and each one matters), and for every chat message by default
 * (DEFAULT_CHAT_POLICY); `chatPolicy: "flagged"` reads only chat the rules
 * or Guard flagged.
 */
export function needsPolicy(
  kind: ModerationKind,
  reasons: readonly ModerationReason[],
  chatPolicy: ChatPolicy = DEFAULT_CHAT_POLICY,
): boolean {
  return (
    kind === "review" ||
    chatPolicy === "always" ||
    reasons.some((r) => r.action === "flag")
  );
}

/** Whether the policy model reads every chat message, or only flagged ones. */
export type ChatPolicy = "always" | "flagged";
export const DEFAULT_CHAT_POLICY: ChatPolicy = "always";

/**
 * Held only because a check couldn't run (a model failed, or the daily cap
 * was spent): worth screening again automatically before a person sees it.
 */
export function needsRetry(reasons: readonly ModerationReason[]): boolean {
  const blocking = reasons.filter((r) => r.action !== "flag");
  return (
    blocking.length > 0 &&
    blocking.every((r) => r.action === "hold" && RETRY_CODES.has(r.code))
  );
}

/**
 * The failed-check reasons. Other system reasons (a review burst) are for a
 * person: screening the text again wouldn't change them.
 */
const RETRY_CODES: ReadonlySet<ReasonCode> = new Set([
  "model-unavailable",
  "daily-cap",
]);

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

/**
 * Chat is lighter (the owner, 2026-09-27: "just no really bad abuse").
 * Contact details, rooms and links are how study groups form, so only a
 * very sure `personal-info` score holds: someone else's private details,
 * not a phone number shared to meet up. Spam holds only when it's clear,
 * and never removes: a textbook for sale shouldn't vanish. Targeting a
 * person holds as in reviews.
 */
export const DEFAULT_CHAT_POLICY_THRESHOLDS: PolicyThresholds = {
  ...DEFAULT_POLICY_THRESHOLDS,
  "personal-info": { hold: 0.9 },
  spam: { hold: 0.9 },
};

/**
 * Labels the policy model scores for each kind. Chat doesn't score
 * academic integrity (sharing answers is discouraged by the room rules, not
 * held), misconduct claims or off-topic, so its prompt stays short.
 */
export const POLICY_LABELS: Readonly<Record<ModerationKind, PolicyLabel[]>> = {
  review: [
    "academic-integrity",
    "targets-person",
    "personal-info",
    "misconduct-claim",
    "spam",
    "off-topic",
  ],
  chat: ["targets-person", "personal-info", "spam"],
};

/** Each kind's default thresholds. */
export const POLICY_THRESHOLDS: Readonly<
  Record<ModerationKind, PolicyThresholds>
> = {
  review: DEFAULT_POLICY_THRESHOLDS,
  chat: DEFAULT_CHAT_POLICY_THRESHOLDS,
};

/**
 * The labels whose scores act on this post: all of them for reviews. For
 * chat, `personal-info` acts only when there's something to expose: a
 * contact detail that isn't plainly the writer's own ("her cell is …"), or
 * Guard's privacy category. Measured live on 2026-09-27, the small chat
 * model scored 1 on "text me at …" and on messages with no details at all.
 */
export function actingPolicyLabels(
  kind: ModerationKind,
  text: string,
  reasons: readonly ModerationReason[],
): readonly PolicyLabel[] {
  if (kind === "review") return POLICY_LABELS.review;
  const exposes =
    reasons.some((r) => r.code === "privacy") ||
    findContacts(text).some((c) => !c.own);
  return exposes
    ? POLICY_LABELS.chat
    : POLICY_LABELS.chat.filter((l) => l !== "personal-info");
}

export function policyReasons(
  kind: ModerationKind,
  scores: ModerationScores,
  thresholds: PolicyThresholds = POLICY_THRESHOLDS[kind],
  labels: readonly PolicyLabel[] = POLICY_LABELS[kind],
): ModerationReason[] {
  const reasons: ModerationReason[] = [];
  for (const label of labels) {
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

/**
 * Urgent: a serious safety category, or chat's spam guard, since spam
 * across rooms is the abuse the owner most wants caught quickly.
 */
export const isUrgent = (reasons: readonly ModerationReason[]) =>
  reasons.some(
    (r) =>
      r.action !== "flag" &&
      (URGENT_CODES.has(r.code) || r.source === "cross-room"),
  );
