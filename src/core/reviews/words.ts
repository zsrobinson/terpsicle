// What the review form says when stage 0 finds something to fix (V2 §7.4):
// specific, active, and never a scolding (SPEC §3.13, DESIGN §5).
import type { ReviewProblemCode } from "~/core/schema";
import { LENGTH_LIMITS } from "../moderation/limits";
import { REASON_WORDS } from "../moderation/policy-text";

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
