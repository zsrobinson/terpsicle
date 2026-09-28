// Pure pieces of the owner's admin panel (docs/V2.md §10): the held share
// against its target, filling in quiet days, the decision log's cursor,
// marking the words a rule matched, the removal reason to offer first, and
// how long something has waited.
import {
  type AdminReason,
  ChatMessageIdSchema,
  CourseCodeSchema,
  type ModerationKind,
  type ModerationReason,
  parseRoomId,
  type ReasonCode,
  type ReportReason,
  TermIdSchema,
} from "../schema";
import type { DecisionCursor, DecisionDay } from "../schema/admin";
import { spanWords } from "../words";
import { URGENT_CODES } from "./decide";

/** V2 §9.2: keep the human queue under 5% of what's screened. */
export const HELD_SHARE_TARGET = 0.05;

/** Days of counts the decision log shows. */
export const DECISION_DAYS = 14;

const DAY_MS = 86_400_000;

/** Held automatic decisions as a share of all of them that day; null with none. */
export function heldShare(day: DecisionDay): number | null {
  const total = day.allowed + day.held + day.rejected;
  return total === 0 ? null : day.held / total;
}

/**
 * `count` UTC days ending today, newest first, with a zero row for any day
 * that had no decisions (so a quiet day reads as 0, not as missing).
 */
export function fillDays(
  counts: readonly DecisionDay[],
  now: Date,
  count = DECISION_DAYS,
): DecisionDay[] {
  const byDay = new Map(counts.map((c) => [c.day, c]));
  const today = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(today - i * DAY_MS).toISOString().slice(0, 10);
    return byDay.get(day) ?? { day, allowed: 0, held: 0, rejected: 0 };
  });
}

/** The keyset cursor after a row: its time, then its id (ties keep order). */
export function decisionCursor(row: {
  createdAt: string;
  id: string;
}): DecisionCursor {
  return `${row.createdAt}~${row.id}`;
}

export function parseDecisionCursor(cursor: DecisionCursor): {
  createdAt: string;
  id: string;
} {
  const at = cursor.lastIndexOf("~");
  return { createdAt: cursor.slice(0, at), id: cursor.slice(at + 1) };
}

export interface TextSegment {
  text: string;
  /** A rule matched these characters. */
  marked: boolean;
}

/**
 * `text` split at the spans the rules matched, so the owner sees exactly
 * which words held it. Overlapping and touching spans merge, and a span past
 * the end is clipped rather than trusted.
 */
export function markedSegments(
  text: string,
  reasons: readonly ModerationReason[],
): TextSegment[] {
  const n = text.length;
  const spans = reasons
    .flatMap((r): [number, number][] =>
      r.span ? [[Math.min(r.span[0], n), Math.min(r.span[1], n)]] : [],
    )
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of spans) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const out: TextSegment[] = [];
  let at = 0;
  for (const [a, b] of merged) {
    if (a > at) out.push({ text: text.slice(at, a), marked: false });
    out.push({ text: text.slice(a, b), marked: true });
    at = b;
  }
  if (at < text.length) out.push({ text: text.slice(at), marked: false });
  return out;
}

/** The owner's reason that fits each thing a post can be held for. */
const REMOVE_REASON_FOR: Partial<Record<ReasonCode, AdminReason>> = {
  email: "personal-info",
  phone: "personal-info",
  address: "personal-info",
  uid: "personal-info",
  privacy: "personal-info",
  "personal-info": "personal-info",
  "targets-person": "targets-person",
  insult: "targets-person",
  defamation: "misconduct-claim",
  "misconduct-claim": "misconduct-claim",
  slur: "hate",
  "blocked-word": "hate",
  hate: "hate",
  violence: "threat",
  weapons: "threat",
  "self-harm": "threat",
  sexual: "sexual",
  "sex-crime": "sexual",
  "academic-integrity": "academic-integrity",
  "shares-answers": "academic-integrity",
  "asks-for-answers": "academic-integrity",
  "code-paste": "academic-integrity",
  "cheating-site": "academic-integrity",
  spam: "spam",
  link: "spam",
  "off-topic": "off-topic",
};

/** The same for what readers reported (a `reported` reason's `report`). */
const REMOVE_REASON_FOR_REPORT: Partial<Record<ReportReason, AdminReason>> = {
  "personal-info": "personal-info",
  "names-a-student": "targets-person",
  hate: "hate",
  threat: "threat",
  sexual: "sexual",
  "misconduct-claim": "misconduct-claim",
  "graded-work": "academic-integrity",
  "off-topic": "off-topic",
  spam: "spam",
};

/** Urgent codes, and a reported threat (reportsAreUrgent's rule). */
const isUrgent = (r: ModerationReason): boolean =>
  URGENT_CODES.has(r.code) || r.report === "threat";

/**
 * The removal reason to offer first: the one matching the most severe thing
 * the item was held for (urgent codes first, then in the order given), or
 * "other" when nothing fits.
 */
export function suggestedRemoveReason(
  reasons: readonly ModerationReason[],
): AdminReason {
  const ranked = [...reasons].sort(
    (a, b) =>
      Number(isUrgent(b)) - Number(isUrgent(a)) ||
      ACTION_RANK[b.action] - ACTION_RANK[a.action],
  );
  for (const r of ranked) {
    const reason = r.report
      ? REMOVE_REASON_FOR_REPORT[r.report]
      : REMOVE_REASON_FOR[r.code];
    if (reason) return reason;
  }
  return "other";
}

const ACTION_RANK = { flag: 0, hold: 1, remove: 2 } as const;

/**
 * How long something has waited since `iso`, in the words every product's
 * times use (`spanWords`): "12 minutes", "3 hours", "2 days".
 */
export function waitedFor(iso: string, now: Date): string {
  return spanWords(now.getTime() - Date.parse(iso));
}

/**
 * How long the owner's "stop this author" lasts (V2 §10): "Stop writing
 * reviews for 30 days", "Stop posting in Chat for 7 days".
 */
export const AUTHOR_STOP_DAYS: Readonly<Record<ModerationKind, number>> = {
  review: 30,
  chat: 7,
};

/** When a stop placed now ends. */
export function authorStopUntil(kind: ModerationKind, now: Date): string {
  return new Date(
    now.getTime() + AUTHOR_STOP_DAYS[kind] * DAY_MS,
  ).toISOString();
}

export interface ChatMessageRef {
  termId: string;
  courseCode: string;
  messageId: string;
}

/**
 * The message a pasted link or id points at, for the owner's "Remove a chat
 * message" (V2 §10): a moderation ref (`<term>:CMSC351:<id>`, as the
 * decision log shows it) or a Chat link to the message's thread
 * (`/chat?term=<term>&course=CMSC351&…&thread=<id>`, where the term may be
 * left to the room). Null otherwise.
 */
export function parseChatMessageRef(pasted: string): ChatMessageRef | null {
  const text = pasted.trim();
  const valid = (termId: unknown, courseCode: unknown, messageId: unknown) =>
    TermIdSchema.safeParse(termId).success &&
    CourseCodeSchema.safeParse(courseCode).success &&
    ChatMessageIdSchema.safeParse(messageId).success
      ? {
          termId: String(termId),
          courseCode: String(courseCode),
          messageId: String(messageId),
        }
      : null;
  const parts = text.split(":");
  const ref = parts.length === 3 ? valid(parts[0], parts[1], parts[2]) : null;
  if (ref) return ref;
  // Any host: previews and localhost have their own.
  let url: URL;
  try {
    url = new URL(text, "https://terpsicle.com");
  } catch {
    return null;
  }
  if (url.pathname !== "/chat") return null;
  const q = url.searchParams;
  // Chat leaves out `term` for the current one; the room names it too.
  const room = parseRoomId(q.get("room") ?? "");
  return valid(
    q.get("term") ?? room?.termId,
    q.get("course") ?? room?.courseCode,
    q.get("thread"),
  );
}
