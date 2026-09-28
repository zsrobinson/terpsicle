// The inbox and grouped pushes (docs/V2.md §6.7): which group each
// notification joins (its push tag), how a group is worded once it holds
// more than one event ("3 mentions in CMSC351"), and when a push that
// replaces a group's notification buzzes again. Pure: the server passes the
// group as D1 has it, and the time as an argument.
import { chatPreview } from "../chat/notify";
import type { IsoDate } from "../schema";
import type { InboxProduct, InboxType } from "../schema/notifications";
import { heldWords, readHeldLabel } from "./admin-alert";
import { listWords } from "./list-words";

export { listWords };

/** Push tags are 64 characters at most; a long room id is cut (a shared tag only groups). */
const TAG_MAX = 64;
const tag = (text: string) => text.slice(0, TAG_MAX);

/** Titles are 120 characters at most (`PushPayloadSchema`). */
const TITLE_MAX = 120;
const title = (text: string) => text.slice(0, TITLE_MAX);

/** Which product each type belongs to: the mark the bell shows beside it. */
export const INBOX_PRODUCT: Record<InboxType, InboxProduct> = {
  "seat-open": "schedule",
  "chat-mention": "chat",
  "chat-reply": "chat",
  "todo-due": "todo",
  "admin-urgent": "admin",
};

/** A room's mentions are one group. */
export const chatMentionTag = (roomId: string) => tag(`chat-mention:${roomId}`);
/** A thread's replies are one group (the thread's first message's id). */
export const chatReplyTag = (threadId: string) => tag(`chat-reply:${threadId}`);
/** Every seat that opens in a term, until it's read, is one group. */
export const seatTag = (termId: string) => tag(`seat:${termId}`);
/** One "Due tomorrow" per due date. */
export const todoDueTag = (date: IsoDate) => tag(`todo-due:${date}`);
/** The owner's urgent moderation items. */
export const ADMIN_URGENT_TAG = "admin-urgent";

/** What the newest event of a group says, as its sender or the inbox knows it. */
export type InboxEvent =
  | {
      type: "chat-mention" | "chat-reply";
      /** Who wrote it; null for an account that's gone. */
      actor: string | null;
      /** "CMSC351", "CMSC351 · 0101" (`chatPlaceWords`). */
      place: string;
      /** The message as it is now; null when the object couldn't say. */
      text: string | null;
    }
  | {
      type: "seat-open" | "todo-due" | "admin-urgent";
      title: string;
      body: string;
    };

export interface InboxGroup {
  /** Events in the group (unread, or read together), this one included. */
  count: number;
  /** Seats: each event's section ("CMSC351 0101"), newest first. */
  labels: readonly string[];
}

/**
 * The words a group shows, in the inbox and on the push that stands for
 * it (V2 §6.7): alone, "Maya in CMSC351" with the message, "Maya replied
 * to your question", "A seat opened in CMSC351 0101"; grouped, "3 mentions
 * in CMSC351" with the newest ("Maya: …"), "4 replies to your question in
 * CMSC351", "Seats opened in 3 sections you're watching" with the list.
 * No title starts with "Terpsicle".
 *
 * `showText: false` (a push, for someone who keeps chat off their lock
 * screen) leaves out who and what: "New mention in CMSC351", "3 mentions
 * in CMSC351", with no body.
 */
export function groupWords(
  latest: InboxEvent,
  group: InboxGroup,
  options: { showText?: boolean } = {},
): { title: string; body: string } {
  const n = Math.max(1, group.count);
  switch (latest.type) {
    case "chat-mention":
    case "chat-reply": {
      if (options.showText === false)
        return {
          title: title(
            latest.type === "chat-mention"
              ? n === 1
                ? `New mention in ${latest.place}`
                : `${n} mentions in ${latest.place}`
              : n === 1
                ? `New reply in ${latest.place}`
                : `${n} replies to your question in ${latest.place}`,
          ),
          body: "",
        };
      const actor = latest.actor ?? "A classmate";
      const text = latest.text === null ? null : chatPreview(latest.text);
      if (n === 1)
        return {
          title: title(
            latest.type === "chat-mention"
              ? `${actor} in ${latest.place}`
              : `${actor} replied to your question`,
          ),
          body: text ?? "",
        };
      return {
        title: title(
          latest.type === "chat-mention"
            ? `${n} mentions in ${latest.place}`
            : `${n} replies to your question in ${latest.place}`,
        ),
        body: text === null ? "" : `${actor}: ${text}`,
      };
    }
    case "seat-open": {
      const sections = [...new Set(group.labels)];
      if (sections.length <= 1)
        return { title: title(latest.title), body: latest.body };
      return {
        title: `Seats opened in ${sections.length} sections you're watching`,
        body: listWords(sections),
      };
    }
    case "admin-urgent": {
      // Each row is one held item; the group's words cover them all.
      const items = group.labels.flatMap((l) => readHeldLabel(l) ?? []);
      if (items.length === 0)
        return { title: title(latest.title), body: latest.body };
      const words = heldWords(items);
      return { title: title(words.title), body: words.body };
    }
    case "todo-due":
      return { title: title(latest.title), body: latest.body };
  }
}

/** An event in a group, for the renotify rules. */
export interface GroupedEvent {
  /** Who caused it (chat); null otherwise. */
  actorId: string | null;
  createdAt: string;
}

const HOUR_MS = 3_600_000;

/**
 * Whether a push that replaces its group's notification buzzes again
 * (`renotify`, V2 §6.7): a mention from someone new, a seat opening and an
 * admin item, yes; a reply, only the first in an hour; "Due tomorrow",
 * never. `others` are the group's other unread events. A push that
 * replaces nothing buzzes anyway, whatever this says.
 */
export function shouldRenotify(
  type: InboxType,
  event: GroupedEvent,
  others: readonly GroupedEvent[],
): boolean {
  switch (type) {
    case "seat-open":
    case "admin-urgent":
      return true;
    case "todo-due":
      return false;
    case "chat-mention":
      return !others.some((o) => o.actorId === event.actorId);
    case "chat-reply": {
      // Walk the group oldest first: a reply buzzes when the last one that
      // buzzed is an hour old or more (the first always does).
      const times = [...others.map((o) => o.createdAt), event.createdAt]
        .map((t) => Date.parse(t))
        .sort((a, b) => a - b);
      const at = Date.parse(event.createdAt);
      let buzzed = Number.NEGATIVE_INFINITY;
      let last = false;
      for (const t of times) {
        last = t - buzzed >= HOUR_MS;
        if (last) buzzed = t;
        if (t === at) return last;
      }
      return last;
    }
  }
}

/** The inbox's page cursor: the last item's time and id, opaque to the app. */
export function inboxCursor(item: { createdAt: string; id: string }): string {
  return `${item.createdAt}|${item.id}`;
}

export function readInboxCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  const bar = cursor.indexOf("|");
  if (bar < 1) return null;
  const createdAt = cursor.slice(0, bar);
  const id = cursor.slice(bar + 1);
  if (Number.isNaN(Date.parse(createdAt)) || id.length === 0) return null;
  return { createdAt, id };
}
