import { addDays } from "../ics/dates";
import type { IsoDate, TodoItem, TodoListResult } from "../schema";

// Todo's list as the browser keeps it (docs/V3.md §3.8): a week at a time,
// as `todo/list` answers for it, and those weeks read together as one list.
// A change shows in every week that has the item, and only there. Pure:
// the weeks and their times are arguments.

/** One week's answer: what Todo keeps for the week from `first`. */
export interface WeekList {
  /** Due that week, and your own tasks with no date (every week lists those). */
  readonly items: readonly TodoItem[];
  /** The uids among `items` marked done. */
  readonly done: readonly string[];
  /** The course groups hidden on the account: the same for every week. */
  readonly hidden: readonly string[];
}

/** Whether an item is the week's from `first`: due that week, or never dated. */
export function inWeek(
  item: Pick<TodoItem, "dueDate">,
  first: IsoDate,
): boolean {
  return (
    item.dueDate === null ||
    (item.dueDate >= first && item.dueDate <= addDays(first, 6))
  );
}

/** A `todo/list` answer for the week from `first`, as the week keeps it. */
export function weekList(
  first: IsoDate,
  answer: Pick<TodoListResult, "items" | "done" | "hidden">,
): WeekList {
  const items = answer.items.filter((item) => inWeek(item, first));
  const uids = new Set(items.map((item) => item.uid));
  return {
    items,
    done: answer.done.filter((uid) => uids.has(uid)),
    hidden: answer.hidden,
  };
}

/** The weeks on hand, read as one list. */
export interface CombinedList {
  items: readonly TodoItem[];
  done: ReadonlySet<string>;
  hidden: ReadonlySet<string>;
}

/**
 * The weeks as one list: each item, and its done mark, from the newest
 * answer that has it (`at`, when it came). Undated tasks come with every
 * answer, so the newest week's are the list's: one deleted elsewhere goes
 * with the next answer. Hidden courses are the newest answer's too.
 */
export function combineWeeks(
  weeks: readonly { list: WeekList; at: number }[],
): CombinedList {
  const newest = [...weeks].sort((a, b) => b.at - a.at);
  const items: TodoItem[] = [];
  const done = new Set<string>();
  const seen = new Set<string>();
  newest.forEach(({ list }, index) => {
    const marks = new Set(list.done);
    for (const item of list.items) {
      if (seen.has(item.uid)) continue;
      if (item.dueDate === null && index > 0) continue;
      seen.add(item.uid);
      items.push(item);
      if (marks.has(item.uid)) done.add(item.uid);
    }
  });
  return { items, done, hidden: new Set(newest[0]?.list.hidden ?? []) };
}

/** An item in any of the weeks, by uid. */
export function findWeekItem(
  lists: readonly WeekList[],
  uid: string,
): TodoItem | undefined {
  for (const list of lists) {
    const item = list.items.find((i) => i.uid === uid);
    if (item) return item;
  }
  return undefined;
}

/**
 * The week from `first` with `uid`'s item replaced by `item` if it's the
 * week's (in its place, or last), and taken out otherwise or for null;
 * its done mark goes with it. The same list when nothing changes.
 */
export function withItem(
  list: WeekList,
  first: IsoDate,
  uid: string,
  item: TodoItem | null,
  done: boolean,
): WeekList {
  const at = list.items.findIndex((i) => i.uid === uid);
  const fits = item !== null && inWeek(item, first);
  const marked = list.done.includes(uid);
  if (at === -1 && !fits) return list;
  if (fits && list.items[at] === item && marked === done) return list;
  const items = list.items.filter((i) => i.uid !== uid);
  if (fits) items.splice(at === -1 ? items.length : at, 0, item);
  const others = list.done.filter((u) => u !== uid);
  return { ...list, items, done: fits && done ? [...others, uid] : others };
}

/** The week with `uid` marked done or not, if the week has it; else the same list. */
export function withDone(list: WeekList, uid: string, done: boolean): WeekList {
  if (!list.items.some((i) => i.uid === uid)) return list;
  if (list.done.includes(uid) === done) return list;
  return {
    ...list,
    done: done ? [...list.done, uid] : list.done.filter((u) => u !== uid),
  };
}

/** The week with a course group hidden or shown; the same list if it already was. */
export function withHidden(
  list: WeekList,
  key: string,
  hidden: boolean,
): WeekList {
  if (list.hidden.includes(key) === hidden) return list;
  return {
    ...list,
    hidden: hidden
      ? [...list.hidden, key]
      : list.hidden.filter((k) => k !== key),
  };
}

/** The week without anything from ELMS (a disconnect). */
export function withoutElms(list: WeekList): WeekList {
  if (!list.items.some((i) => i.source === "elms")) return list;
  const items = list.items.filter((i) => i.source !== "elms");
  const uids = new Set(items.map((i) => i.uid));
  return { ...list, items, done: list.done.filter((u) => uids.has(u)) };
}
