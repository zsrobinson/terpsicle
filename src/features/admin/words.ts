// The admin panel's words for moderation's codes (SPEC §3.13: plain words).
// The reason codes' words are REASON_WORDS in ~/core/moderation/policy-text,
// shared with the composers.
import { termLabel } from "~/core/catalog/terms";
import { AUTHOR_STOP_DAYS } from "~/core/moderation/admin";
import type {
  AdminReason,
  DecisionStage,
  ModerationKind,
  PolicyLabel,
  ReasonSource,
  ReportReason,
  ReviewQueueContext,
  StoredVerdict,
} from "~/core/schema";
import { formatShortDate } from "~/core/time/format";

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

/** "Stop this author writing reviews for 30 days" (V2 §10), per surface. */
export function stopWords(kind: ModerationKind): string {
  return kind === "review"
    ? `Also stop this author writing reviews for ${AUTHOR_STOP_DAYS.review} days`
    : `Also stop this author posting in Chat for ${AUTHOR_STOP_DAYS.chat} days`;
}

/** "Author can't write reviews until Oct 26", after a stop. */
export function stoppedWords(kind: ModerationKind, until: string): string {
  const day = formatShortDate(until.slice(0, 10));
  return kind === "review"
    ? `Author can't write reviews until ${day}`
    : `Author can't post in Chat until ${day}`;
}

/** "Ada Brandt · rated 2 of 5 · Fall 2026 · grade B": a held review's context. */
export function reviewContextWords(review: ReviewQueueContext): string {
  return [
    review.instructor,
    `rated ${review.rating} of 5`,
    review.termId ? termLabel(review.termId) : null,
    review.grade ? `grade ${review.grade}` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}
