import { useEffect, useMemo, useState } from "react";
import { type TermTags, termTags } from "~/core/catalog/term-tag";
import type { ItemCourse } from "~/core/home";
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
import { type TodoPhase, useTodo } from "~/features/todo/todo-store";
import { loadCalendars, loadCampus } from "./data";
import { type HomeLocal, readHomeLocal } from "./local";

// Home's shared state: the clock, what's on the device, and the published
// files every part reads. Local first: the device's plans show at once,
// the calendars and campus map fill in after.

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
  const [calendars, setCalendars] = useState<{
    today: IsoDate;
    list: readonly AcademicCalendar[];
  } | null>(null);
  useEffect(() => {
    let live = true;
    void loadCalendars(today)
      .catch(() => [])
      .then((list) => {
        if (live) setCalendars({ today, list });
      });
    return () => {
      live = false;
    };
  }, [today]);
  const list = calendars?.list ?? NO_CALENDARS;
  return useMemo(
    () => ({
      tags: termTags(today, list),
      calendars: list,
      settled: calendars?.today === today,
    }),
    [today, list, calendars],
  );
}
const NO_CALENDARS: readonly AcademicCalendar[] = [];

/** Walking distances; null until they load (or when they can't). */
export function useHomeCampus(wanted: boolean): CampusMap | null {
  const [campus, setCampus] = useState<CampusMap | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void loadCampus()
      .catch(() => null)
      .then((map) => {
        if (live) setCampus(map);
      });
    return () => {
      live = false;
    };
  }, [wanted]);
  return campus;
}

/** Todo's list as Home reads it: Todo's own store, in memory only. */
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
 * Todo's list, loaded when `on` (signed in, with Todo on): the same store
 * and the same call as /todo, so a check here is a check there.
 */
export function useHomeTodo(today: IsoDate, on: boolean): HomeTodo {
  const phase = useTodo((s) => s.phase);
  const load = useTodo((s) => s.load);
  const all = useTodo((s) => s.items);
  const done = useTodo((s) => s.done);
  const hidden = useTodo((s) => s.hidden);
  const feed = useTodo((s) => s.feed);
  const scheduler = useSchedulerCourses();
  useEffect(() => {
    if (on) void load(today, Date.now());
  }, [on, load, today]);
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
      retry: () => void load(today, Date.now()),
    };
  }, [phase, all, done, hidden, feed, scheduler, load, today]);
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
