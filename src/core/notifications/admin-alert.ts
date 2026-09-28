// The owner's alert for urgent moderation items (docs/V2.md §6.7, §9.4):
// what each item was held for and where, and the words for a group of
// them, "Held for you: spam in 3 courses". Never the text, and never who
// wrote it. Each item's inbox row keeps a small label ("spam|chat|CMSC351")
// so a group's words can be worked out again from the rows alone, as a
// seat group's list is.
import { URGENT_CODES } from "../moderation/decide";
import type { ModerationKind, ModerationReason } from "../schema/moderation";
import { listWords } from "./list-words";

/** Why an item is urgent, most serious first. */
export const HELD_REASONS = [
  "child-safety",
  "self-harm",
  "threat",
  "violence",
  "weapons",
  "sex-crime",
  "spam",
  "other",
] as const;
export type HeldReason = (typeof HELD_REASONS)[number];

const REASON_WORDS: Record<HeldReason, string> = {
  "child-safety": "child safety",
  "self-harm": "self-harm",
  threat: "a threat",
  violence: "violence",
  weapons: "weapons",
  "sex-crime": "a sex crime",
  spam: "spam",
  other: "something urgent",
};

/**
 * The most serious urgent reason among an item's (the rules of `isUrgent`
 * and `reportsAreUrgent`): chat's spam guard is "spam", a reported threat
 * "a threat", an urgent code itself.
 */
export function heldReason(reasons: readonly ModerationReason[]): HeldReason {
  const found = new Set<HeldReason>();
  for (const r of reasons) {
    if (r.action === "flag") continue;
    if (r.source === "cross-room") found.add("spam");
    else if (r.report === "threat") found.add("threat");
    else if (URGENT_CODES.has(r.code))
      found.add(
        (HELD_REASONS as readonly string[]).includes(r.code)
          ? (r.code as HeldReason)
          : "other",
      );
  }
  return HELD_REASONS.find((r) => found.has(r)) ?? "other";
}

/** One held item, as its alert names it. */
export interface HeldItem {
  reason: HeldReason;
  surface: ModerationKind;
  /** The course it's about, when the snapshot has one. */
  course: string | null;
}

/** The label an item's inbox row keeps. */
export function heldLabel(item: HeldItem): string {
  return `${item.reason}|${item.surface}|${item.course ?? ""}`;
}

export function readHeldLabel(label: string): HeldItem | null {
  const [reason, surface, course] = label.split("|");
  if (!(HELD_REASONS as readonly string[]).includes(reason ?? "")) return null;
  if (surface !== "review" && surface !== "chat") return null;
  return {
    reason: reason as HeldReason,
    surface,
    course: course ? course : null,
  };
}

/** "CMSC351", "3 courses", "a review", "2 messages". */
function whereWords(items: readonly HeldItem[]): string {
  const courses = [
    ...new Set(items.flatMap((i) => (i.course ? [i.course] : []))),
  ];
  if (courses.length === 1 && items.every((i) => i.course !== null))
    return courses[0] ?? "";
  if (courses.length > 1) return `${courses.length} courses`;
  const reviews = items.filter((i) => i.surface === "review").length;
  const messages = items.length - reviews;
  const parts = [
    reviews === 1 ? "a review" : reviews > 1 ? `${reviews} reviews` : null,
    messages === 1 ? "a message" : messages > 1 ? `${messages} messages` : null,
  ].filter((p): p is string => p !== null);
  return parts.join(" and ");
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The alert's words for the items it stands for: "Held for you: spam in 3
 * courses" with the courses, "Held for you: a threat in CMSC351", or, for
 * several kinds, "Held for you: 4 urgent items" with each kind and where.
 */
export function heldWords(items: readonly HeldItem[]): {
  title: string;
  body: string;
} {
  if (items.length === 0)
    return { title: "Held for you", body: "Open the queue to decide." };
  const reasons = HELD_REASONS.filter((r) => items.some((i) => i.reason === r));
  const [only] = reasons;
  if (reasons.length === 1 && only) {
    // In order, so a group reads the same however its rows come back.
    const courses = [
      ...new Set(items.flatMap((i) => (i.course ? [i.course] : []))),
    ].sort();
    return {
      title: `Held for you: ${REASON_WORDS[only]} in ${whereWords(items)}`,
      body:
        courses.length > 1
          ? `${listWords(courses)}. Open the queue to decide.`
          : "Open the queue to decide.",
    };
  }
  return {
    title: `Held for you: ${items.length} urgent items`,
    body: `${capital(
      listWords(
        reasons.map(
          (r) =>
            `${REASON_WORDS[r]} in ${whereWords(items.filter((i) => i.reason === r))}`,
        ),
        4,
      ),
    )}.`,
  };
}

/** At most one alert an hour: what's held in between waits and comes grouped. */
export const ADMIN_ALERT_EVERY_MS = 3_600_000;

/** Whether an admin whose last alert was at `lastAt` (ISO, or none) can get one now. */
export function adminAlertDue(lastAt: string | null, now: Date): boolean {
  if (lastAt === null) return true;
  const last = Date.parse(lastAt);
  return Number.isNaN(last) || now.getTime() - last >= ADMIN_ALERT_EVERY_MS;
}
