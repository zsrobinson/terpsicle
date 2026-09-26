// The admin panel's words for moderation's codes (SPEC §3.13: plain words).
// The reason codes' words are REASON_WORDS in ~/core/moderation/policy-text,
// shared with the composers.
import type {
  AdminReason,
  DecisionStage,
  ModerationKind,
  PolicyLabel,
  ReasonSource,
  ReportReason,
  StoredVerdict,
} from "~/core/schema";

export const KIND_WORDS: Readonly<Record<ModerationKind, string>> = {
  review: "Review",
  chat: "Chat message",
};

/** Filter labels: plural, for "show me the …". */
export const KIND_PLURAL: Readonly<Record<ModerationKind, string>> = {
  review: "Reviews",
  chat: "Chat",
};

export const STAGE_WORDS: Readonly<Record<DecisionStage, string>> = {
  rules: "Rules",
  model: "Automatic check",
  human: "You",
  reports: "Reports",
};

export const VERDICT_WORDS: Readonly<Record<StoredVerdict, string>> = {
  allow: "Allowed",
  hold: "Held",
  reject: "Rejected",
  remove: "Removed",
  restore: "Restored",
  hide: "Hidden",
};

/** Who found each reason. Model names stay out of the panel. */
export const SOURCE_WORDS: Readonly<Record<ReasonSource, string>> = {
  rules: "rules",
  guard: "safety check",
  policy: "policy check",
  system: "system",
  admin: "you",
  reports: "readers",
};

/** What a reader said when reporting, after REASON_WORDS.reported. */
export const REPORT_WORDS: Readonly<Record<ReportReason, string>> = {
  "personal-info": "personal info",
  "names-a-student": "names a student",
  hate: "hate",
  threat: "a threat",
  sexual: "sexual content",
  "misconduct-claim": "a misconduct claim",
  "graded-work": "shares graded work",
  "off-topic": "not about the course",
  other: "something else",
};

export const ADMIN_REASON_WORDS: Readonly<Record<AdminReason, string>> = {
  fine: "Fine",
  "personal-info": "Personal info",
  "targets-person": "Targets a person",
  hate: "Hate",
  threat: "A threat",
  sexual: "Sexual content",
  "academic-integrity": "Academic integrity",
  "misconduct-claim": "Misconduct claim",
  spam: "Spam or an ad",
  "off-topic": "Not about the course",
  other: "Something else",
};

/** Every reason the owner can remove for, in the menu's order. */
export const REMOVE_REASONS: readonly AdminReason[] = [
  "personal-info",
  "targets-person",
  "hate",
  "threat",
  "sexual",
  "academic-integrity",
  "misconduct-claim",
  "spam",
  "off-topic",
  "other",
];

export const SCORE_WORDS: Readonly<Record<PolicyLabel, string>> = {
  "academic-integrity": "academic integrity",
  "targets-person": "targets a person",
  "personal-info": "personal info",
  "misconduct-claim": "misconduct claim",
  spam: "spam",
  "off-topic": "off topic",
};

/** 0.74 → "74%". */
export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** 1234 → "1,234". */
export function count(n: number): string {
  return n.toLocaleString("en-US");
}
