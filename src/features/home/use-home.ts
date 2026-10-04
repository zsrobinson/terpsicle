import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type TermTags, termTags } from "~/core/catalog/term-tag";
import type { ItemCourse } from "~/core/home";
import { addDays } from "~/core/ics/dates";
import type {
  AcademicCalendar,
  CourseCode,
  CourseColor,
  IsoDate,
  Minutes,
  TodoItem,
} from "~/core/schema";
import {
  courseKey,
  isHiddenItem,
  itemCourse,
  newYorkClock,
} from "~/core/todo/list";
import type { CampusMap } from "~/core/travel";
import {
  type SchedulerCourses,
  todoCourseColors,
  useSchedulerCourses,
} from "~/features/todo/course-colors";
import {
  type TodoPhase,
  todoKeys,
  todoWeekQuery,
} from "~/features/todo/todo-queries";
import {
  useAskElms,
  useElmsSync,
  useForgetTodoOnSignOut,
  useTodoList,
  weekPhase,
} from "~/features/todo/use-todo";
import { type HomeLocal, readHomeLocal } from "./local";
import { homeCalendarsQuery, homeCampusQuery } from "./queries";

// Home's shared state: the clock, what's on the device, and the published
// files every part reads (./queries.ts). Local first: the device's plans
// show at once, the calendars and campus map fill in after.

export interface HomeClock {
  now: number;
  /** New York's date and minutes after midnight: the campus's day. */
  today: IsoDate;
  minutes: Minutes;
}

function clockAt(now: number): HomeClock {
  const { date, minutes } = newYorkClock(now);
  return { now, today: date, minutes };
}

/** The campus clock, a minute at a time: classes drop off as they end. */
export function useHomeClock(): HomeClock {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return useMemo(() => clockAt(now), [now]);
}

/** What's on this device; null while it's read (a few milliseconds). */
export function useHomeLocal(): HomeLocal | null {
  const [local, setLocal] = useState<HomeLocal | null>(null);
  useEffect(() => {
    let live = true;
    const read = () =>
      void readHomeLocal().then((next) => {
        if (live) setLocal(next);
      });
    read();
    // Back to Home from a product, or from another app: read again.
    const onShow = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);
  return local;
}

export interface HomeTerms {
  /** Now and Next: from the seasons at first, then the academic calendars. */
  tags: TermTags;
  calendars: readonly AcademicCalendar[];
  /** The calendars have been asked for (loaded, or failed to). */
  settled: boolean;
}

/** Now and Next today, and the calendars they came from. */
export function useHomeTerms(today: IsoDate): HomeTerms {
  // A new day keeps the day before's calendars on screen until its own load.
  const query = useQuery({
    ...homeCalendarsQuery(today),
    placeholderData: keepPreviousData,
  });
  const list = query.data ?? NO_CALENDARS;
  // Asked for today: loaded, or failed to (not the day before's, shown meanwhile).
  const settled = query.isFetched && !query.isPlaceholderData;
  return useMemo(
    () => ({ tags: termTags(today, list), calendars: list, settled }),
    [today, list, settled],
  );
}
const NO_CALENDARS: readonly AcademicCalendar[] = [];

/** Walking distances; null until they load (or when they can't). Kept once loaded. */
export function useHomeCampus(wanted: boolean): CampusMap | null {
  return useQuery({ ...homeCampusQuery(), enabled: wanted }).data ?? null;
}

/** Todo's list as Home reads it: Todo's own week queries. */
export interface HomeTodo {
  phase: TodoPhase;
  /** The list, less the courses you've hidden in Todo. */
  items: readonly TodoItem[];
  done: ReadonlySet<string>;
  /** An ELMS calendar is connected, or there's something on the list anyway. */
  connected: boolean;
  /** How an item files under a course, as Todo files it. */
  course: ItemCourse;
  scheduler: SchedulerCourses;
  retry: () => void;
}

/**
 * Todo's weeks, asked for when `on` (signed in, with Todo on): the same
 * queries as /todo, so a check here is a check there, and a week either
 * page has read shows on the other at once.
 */
export function useHomeTodo(today: IsoDate, on: boolean): HomeTodo {
  // This week, and the three after it for Coming up's 21 days. Four
  // `useQuery`s rather than `useQueries`, which Home would load for this alone.
  const thisWeek = useQuery({ ...todoWeekQuery(today), enabled: on });
  const after = [
    useQuery({ ...todoWeekQuery(addDays(today, 7)), enabled: on }),
    useQuery({ ...todoWeekQuery(addDays(today, 14)), enabled: on }),
    useQuery({ ...todoWeekQuery(addDays(today, 21)), enabled: on }),
  ];
  // This week decides; the weeks after it fill in Coming up when they can.
  const shown = weekPhase(on, thisWeek);
  const phase =
    shown === "ready" && after.some((w) => w.data === undefined && !w.isError)
      ? "loading"
      : shown;
  const { items: all, done, hidden } = useTodoList();
  const { feed } = useElmsSync();
  useAskElms(on);
  useForgetTodoOnSignOut();
  const scheduler = useSchedulerCourses();
  const client = useQueryClient();
  const retry = useCallback(
    () =>
      void client.refetchQueries({ queryKey: todoKeys.weeks, type: "active" }),
    [client],
  );
  return useMemo(() => {
    const plan = scheduler.planCourses;
    return {
      phase,
      items: all.filter((i) => !isHiddenItem(i, hidden, plan)),
      done,
      connected: feed !== null || all.length > 0,
      course: (item: TodoItem) => ({
        key: courseKey(item, plan),
        code: itemCourse(item, plan),
        label: item.courseLabel,
      }),
      scheduler,
      retry,
    };
  }, [phase, all, done, hidden, feed, scheduler, retry]);
}

/**
 * One color per course across Home, Todo's way: the scheduler's color,
 * else a distinct default, so a class's tag in Today and in This week match.
 */
export function useHomeColors(
  codes: readonly CourseCode[],
  scheduler: SchedulerCourses,
): Readonly<Record<CourseCode, CourseColor>> {
  const key = [...new Set(codes)].sort().join(",");
  // The codes (`key`) decide the colors, not the array: a new array each render.
  return useMemo(
    () => todoCourseColors(key ? key.split(",") : [], scheduler.colors),
    [key, scheduler.colors],
  );
}
