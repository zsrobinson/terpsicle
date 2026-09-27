import type {
  ChatErrorCode,
  ChatReportReason,
  HeldReason,
  Moderation,
  ThreadSummary,
} from "../schema";
import { campusDate, stopEndWords } from "../time/format";

// Plain words for a conversation (SPEC §3.13, with contractions): times and
// day dividers in College Park time, what your held messages say, who's
// typing, and the report reasons. Never red, never alarming (DESIGN §5).

const ZONE = "America/New_York";

const WEEKDAY = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  weekday: "long",
  month: "short",
  day: "numeric",
});
const WITH_YEAR = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});
const CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hour: "numeric",
  minute: "2-digit",
});

/** "2026-09-25": the College Park date of an instant. */
export function campusDay(iso: string): string {
  return campusDate(iso);
}

/** Whole days from one campus date to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** A day divider: "Today", "Yesterday", "Wednesday, Sep 23", or "Sep 23, 2025" past a week. */
export function dayWords(iso: string, now: string): string {
  const ago = daysBetween(campusDay(iso), campusDay(now));
  if (ago <= 0) return "Today";
  if (ago === 1) return "Yesterday";
  if (ago < 7) return WEEKDAY.format(new Date(iso));
  return WITH_YEAR.format(new Date(iso));
}

/** "2:14pm", "11:05am". */
export function clockWords(iso: string): string {
  return CLOCK.format(new Date(iso)).replace(" ", "").toLowerCase();
}

/** "2:14pm" today, "Yesterday 2:14pm", "Sep 23 2:14pm". */
export function whenWords(iso: string, now: string): string {
  const day = dayWords(iso, now);
  if (day === "Today") return clockWords(iso);
  const short = day.includes(",") ? day.split(", ").pop() : day;
  return `${short} ${clockWords(iso)}`;
}

/** Consecutive messages by one person within this long share one header. */
export const RUN_GAP_MS = 5 * 60_000;

/** "1 reply · last 12:03am", "3 replies · last Yesterday 9:10pm". */
export function threadWords(thread: ThreadSummary, now: string): string {
  const replies = `${thread.count} ${thread.count === 1 ? "reply" : "replies"}`;
  return `${replies} · last ${whenWords(thread.lastAt, now)}`;
}

/** "1 person", "42 people". */
export function peopleWords(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

/** "Noor is typing…", "Noor and Sam are typing…", "4 people are typing…". */
export function typingWords(names: readonly string[]): string {
  const first = names.map((n) => n.trim().split(/\s+/)[0] ?? n);
  if (first.length === 0) return "";
  if (first.length === 1) return `${first[0]} is typing…`;
  if (first.length === 2) return `${first[0]} and ${first[1]} are typing…`;
  return `${first.length} people are typing…`;
}

const HELD: Readonly<Record<Exclude<HeldReason, "checking">, string>> = {
  "graded-work":
    "Only you can see this for now: it may be graded work, so a person will look at it.",
  flagged: "Only you can see this for now, until a person looks at it.",
  reported:
    "Only you can see this for now: classmates reported it, so a person will look at it.",
};

/**
 * The one quiet line under your own message that classmates can't see, or
 * null. Only its author ever sees these, and only when a message is really
 * held or removed: one still being checked reads as sent, like any other
 * (the owner, 2026-09-27: nobody should have to think about a bot reading
 * their message). Classmates get it when the check passes, usually within a
 * second.
 */
export function heldWords(moderation: Moderation): string | null {
  if (moderation.state === "visible") return null;
  if (moderation.state === "removed")
    return "A person took this down. Only you can see it.";
  if (moderation.reason === "checking") return null;
  return HELD[moderation.reason];
}

/** "30 seconds", "1 minute", "3 hours". */
function waitWords(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Why a send or change didn't go through, in words (never red). */
export function chatErrorWords(
  code: ChatErrorCode,
  retryAfter: number | null = null,
  until: string | null = null,
): string {
  switch (code) {
    case "slow-down":
      // The owner's stop: when it ends, not why (V2 §10; DESIGN §5).
      if (until) return `You can't post in Chat until ${stopEndWords(until)}.`;
      return retryAfter
        ? `You're sending fast. Try again in ${waitWords(retryAfter)}.`
        : "You're sending fast. Try again in a moment.";
    case "read-only":
      return "This room is read-only now, so it can't take new messages.";
    case "not-a-member":
      return "This room is for people with its sections in a plan.";
    case "not-found":
      return "That message isn't there anymore.";
    case "not-yours":
      return "You can only change your own messages.";
    case "signed-out":
      return "You're signed out. Sign in again to send.";
    case "old-client":
      return "Terpsicle was updated. Reload to keep chatting.";
    case "bad-frame":
      return "That didn't send. Try again.";
  }
}

/**
 * Report reasons, in the order the form lists them: abuse only (the owner,
 * 2026-09-27). "Something else" asks for a note.
 */
export const CHAT_REPORT_REASON_WORDS: Readonly<
  Record<ChatReportReason, string>
> = {
  hate: "Harassment or hate",
  threat: "A threat",
  sexual: "Sexual content",
  spam: "Spam",
  "personal-info": "Someone's private info",
  other: "Something else",
};

/** "3 unread", for a count's accessible name. */
export function unreadWords(n: number): string {
  return `${n} unread`;
}
