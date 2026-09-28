import type { InboxItem, InboxProduct } from "../schema/notifications";
import { campusDate } from "../time/format";
import { relativeWords } from "../words";

// The words and order of the bell and its list (docs/V2.md §6.7): the
// bell's count, the days the list is grouped by, and each row's meta line
// ("Chat · 2 minutes ago"). Times are College Park's, as in Chat; `now` is
// passed in.

/** Each item's product, as its meta line names it. */
export const INBOX_PRODUCT_WORDS: Record<InboxProduct, string> = {
  schedule: "Schedule",
  chat: "Chat",
  todo: "Todo",
  admin: "Admin",
};

/** The bell's number: "4", and "9+" past nine, so it fits its 16px. */
export function bellCount(unread: number): string {
  return unread > 9 ? "9+" : String(unread);
}

/** The bell's name for a screen reader: "Notifications, 4 unread". */
export function bellLabel(unread: number): string {
  return unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
}

export type InboxDay = "Today" | "Yesterday" | "Earlier";

const DAY_MS = 86_400_000;

/** Whole campus days from `iso` to `now`. */
function daysAgo(iso: string, now: string): number {
  return Math.round(
    (Date.parse(campusDate(now)) - Date.parse(campusDate(iso))) / DAY_MS,
  );
}

/** Which of the list's three days an item falls in. */
export function inboxDay(createdAt: string, now: string): InboxDay {
  const ago = daysAgo(createdAt, now);
  if (ago <= 0) return "Today";
  return ago === 1 ? "Yesterday" : "Earlier";
}

/**
 * The list, grouped: Today, Yesterday and Earlier, each newest first, and
 * only the days that have something. Items come newest first from the
 * server; the order within a day is kept.
 */
export function inboxDays<T extends Pick<InboxItem, "createdAt">>(
  items: readonly T[],
  now: string,
): { day: InboxDay; items: T[] }[] {
  const days: { day: InboxDay; items: T[] }[] = [
    { day: "Today", items: [] },
    { day: "Yesterday", items: [] },
    { day: "Earlier", items: [] },
  ];
  for (const item of items) {
    const day = inboxDay(item.createdAt, now);
    days.find((d) => d.day === day)?.items.push(item);
  }
  return days.filter((d) => d.items.length > 0);
}

/**
 * A row's meta line: its product and when, in the words every product's
 * times use (`relativeWords`): "Chat · 2 minutes ago", "Todo · yesterday".
 */
export function inboxMeta(
  item: Pick<InboxItem, "product" | "createdAt">,
  now: string,
): string {
  return `${INBOX_PRODUCT_WORDS[item.product]} · ${relativeWords(item.createdAt, now)}`;
}

/** The list with `ids` (or, with none, everything) read at `at`. */
export function markInboxRead<T extends Pick<InboxItem, "id" | "readAt">>(
  items: readonly T[],
  at: string,
  ids?: readonly string[],
): T[] {
  return items.map((item) =>
    item.readAt === null && (ids === undefined || ids.includes(item.id))
      ? { ...item, readAt: at }
      : item,
  );
}

/** The list with an older page after it; an item already shown isn't repeated. */
export function appendInboxPage<T extends Pick<InboxItem, "id">>(
  items: readonly T[],
  page: readonly T[],
): T[] {
  const shown = new Set(items.map((i) => i.id));
  return [...items, ...page.filter((i) => !shown.has(i.id))];
}
