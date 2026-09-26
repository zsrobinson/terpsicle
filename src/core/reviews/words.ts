// What the review form says when stage 0 finds something to fix (V2 §7.4):
// specific, active, and never a scolding (SPEC §3.13, DESIGN §5).
import type {
  MyReview,
  ReasonCode,
  ReportReason,
  ReviewProblemCode,
  ReviewWriteResult,
} from "~/core/schema";
import { LENGTH_LIMITS } from "../moderation/limits";
import { REASON_WORDS } from "../moderation/policy-text";
import { formatShortDate } from "../time/format";
import { REVIEW_LIMITS } from "./rules";

const { min, max } = LENGTH_LIMITS.review;

const PROBLEM_WORDS: Partial<Record<ReviewProblemCode, string>> = {
  empty: "Write your review first.",
  "too-short": `Write a little more: reviews need at least ${min} characters.`,
  "too-long": `Shorten this to ${max.toLocaleString("en-US")} characters.`,
  link: "Take out the link. Reviews can only link to umd.edu.",
  "cheating-site": "Take out the link. Reviews can't link to answer sites.",
  email: "Take out the email address. Reviews can't include contact details.",
  phone: "Take out the phone number. Reviews can't include contact details.",
  address: "Take out the street address. Reviews can't include addresses.",
  uid: "Take out the ID number. Reviews can't include UIDs.",
  slur: "Take out the slur. Reviews can't include slurs.",
  "blocked-word": "Reword this. That word is often used as a slur.",
  "shares-answers":
    "Take out the answers. Reviews can't share answers to graded work.",
  "code-paste": "Take out the code. Reviews can't include solutions.",
  duplicate: "This review is already posted.",
};

/** The sentence under the review form for a stage-0 problem. */
export function reviewProblemWords(code: ReviewProblemCode): string {
  return (
    PROBLEM_WORDS[code] ??
    (code === "duplicate"
      ? "This review is already posted."
      : REASON_WORDS[code])
  );
}

/** What the author sees while a person looks at their review (V2 §9.2). */
export const REVIEW_HELD_WORDS =
  "A person will look at this first. That usually takes a few days. You can edit it while it waits.";

// ---------- reports (V2 §9.3) ----------

/** The report menu's choices, in the order it lists them. */
export const REPORT_REASON_WORDS: Readonly<Record<ReportReason, string>> = {
  "personal-info": "Shares someone's personal info",
  "names-a-student": "Names a student",
  hate: "Hate or harassment",
  threat: "A threat",
  sexual: "Sexual content",
  "misconduct-claim": "Accuses someone of misconduct",
  "graded-work": "Shares answers to graded work",
  "off-topic": "Isn't about the course",
  other: "Something else",
};

// ---------- where your review stands (reviews/mine) ----------

/** Why a review (or an edit) wasn't posted, in a sentence. */
export function notPostedWords(reason: ReasonCode | null): string {
  if (reason === null || reason === "admin")
    return "A moderator took this down.";
  if (reason === "reported")
    return "Readers reported it, and a moderator took it down.";
  return `It wasn't posted. Why: ${REASON_WORDS[reason].replace(/\.$/, "")}.`;
}

export interface ReviewStanding {
  /** A few words for the badge: "Posted", "Waiting", … */
  label: string;
  /** A sentence under it, or null when the label says it all. */
  detail: string | null;
  /** Whether it can be edited (the server turns down the rest). */
  editable: boolean;
}

/** Where one of your reviews stands, for /reviews/mine and your own card. */
export function reviewStanding(review: MyReview): ReviewStanding {
  const edit = review.pendingEdit;
  switch (review.status) {
    case "published":
      if (edit?.state === "waiting")
        return {
          label: "Posted, edit waiting",
          detail:
            "A person will look at your edit first. Readers see your earlier words until then.",
          editable: true,
        };
      if (edit?.state === "rejected")
        return {
          label: "Posted, edit not posted",
          detail: `${notPostedWords(edit.reason)} Readers still see your earlier words.`,
          editable: true,
        };
      return { label: "Posted", detail: null, editable: true };
    case "held":
      return { label: "Waiting", detail: REVIEW_HELD_WORDS, editable: true };
    case "hidden":
      return {
        label: "Hidden for now",
        detail:
          "Readers reported it, so it's hidden until a person looks at it. You can't change it until then.",
        editable: false,
      };
    case "rejected":
      return {
        label: "Not posted",
        detail: `${notPostedWords(review.reason)} You can delete it and write a new one.`,
        editable: false,
      };
  }
}

// ---------- after sending ----------

/** "3 hours", "2 days": how long until the weekly limit lets up. */
export function waitWords(seconds: number): string {
  const hours = Math.ceil(seconds / 3600);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * What the composer says after a submit or edit that didn't simply post.
 * `invalid` never gets here: its problems show under the text box.
 */
export function writeResultWords(
  result: Exclude<ReviewWriteResult, { status: "invalid" | "published" }>,
  { editingPublished = false } = {},
): string {
  switch (result.status) {
    case "held":
      return editingPublished
        ? "A person will look at your edit first. Readers see your earlier words until then."
        : REVIEW_HELD_WORDS;
    case "rejected":
      return editingPublished
        ? `${notPostedWords(result.reason)} Readers still see your earlier words.`
        : notPostedWords(result.reason);
    case "blocked":
      return `You can't write reviews until ${formatShortDate(result.until.slice(0, 10))}.`;
    case "limit":
      return `You've written ${REVIEW_LIMITS.perWeek} reviews this week. You can write another in ${waitWords(result.retryAfterSeconds)}.`;
    case "not-found":
      return "That review's gone. It may have been deleted.";
    case "under-review":
      return "Readers reported this review, so you can't change it until a person looks at it.";
  }
}
