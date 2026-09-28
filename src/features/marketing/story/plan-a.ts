import type { CourseColor } from "~/core/schema";

// Plan A for Spring 2027, the marketing page's one sample: the demo plan the
// mock app opens with (src/fixtures/mock/plans.ts), with the sections, rooms
// and instructors of the mock catalog (hand-courses.ts), so the page shows
// what the scheduler shows. It's a copy, not an import: fixtures never load
// on `/` (scripts/check-bundle.ts). Two things differ on purpose, and the
// page says it's a sample: CMSC351 0301 is full, so there's a seat to watch,
// and ENGL393's fix is 0205, which lands inside the hours on screen.
//
// Everything here is pure: the week and the Problems tab follow from which
// sections are placed and whether a seat is watched.

/** Mon = 0 … Fri = 4. */
export type Weekday = 0 | 1 | 2 | 3 | 4;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export interface SampleMeeting {
  days: readonly Weekday[];
  /** Minutes since midnight. */
  start: number;
  end: number;
  place: string;
  kind?: "discussion";
}

export interface SampleSection {
  code: string;
  instructor: string;
  meetings: readonly SampleMeeting[];
}

export interface SampleCourse {
  code: string;
  title: string;
  credits: number;
  color: CourseColor;
  genEd?: string;
  /** The first is the one Plan A starts with. */
  sections: readonly SampleSection[];
}

const t = (h: number, m = 0) => h * 60 + m;
const MWF: readonly Weekday[] = [0, 2, 4];
const TUTH: readonly Weekday[] = [1, 3];

export const PLAN_A: readonly SampleCourse[] = [
  {
    code: "CMSC351",
    title: "Algorithms",
    credits: 3,
    color: "violet",
    sections: [
      {
        code: "0301",
        instructor: "Keiko Ashdown",
        meetings: [
          { days: MWF, start: t(11), end: t(11, 50), place: "CSI 1115" },
        ],
      },
    ],
  },
  {
    code: "CMSC330",
    title: "Organization of Programming Languages",
    credits: 3,
    color: "indigo",
    sections: [
      {
        code: "0103",
        instructor: "Grace Kowalczyk",
        meetings: [
          { days: TUTH, start: t(9, 30), end: t(10, 45), place: "IRB 0324" },
          {
            days: [4],
            start: t(12),
            end: t(12, 50),
            place: "CSI 1122",
            kind: "discussion",
          },
        ],
      },
    ],
  },
  {
    code: "STAT400",
    title: "Applied Probability and Statistics I",
    credits: 3,
    color: "pink",
    sections: [
      {
        code: "0101",
        instructor: "Kemi Adeyemi",
        meetings: [
          { days: MWF, start: t(10), end: t(10, 50), place: "ESJ 0202" },
        ],
      },
      {
        code: "0201",
        instructor: "Rana Haddad",
        meetings: [
          { days: MWF, start: t(9), end: t(9, 50), place: "PHY 1412" },
        ],
      },
    ],
  },
  {
    code: "ENGL393",
    title: "Technical Writing",
    credits: 3,
    color: "amber",
    genEd: "FSPW",
    sections: [
      {
        code: "0101",
        instructor: "Signe Lindqvist",
        meetings: [
          { days: TUTH, start: t(9, 30), end: t(10, 45), place: "TWS 1100" },
        ],
      },
      {
        code: "0205",
        instructor: "Helena Ferreira",
        meetings: [
          { days: TUTH, start: t(15, 30), end: t(16, 45), place: "TWS 0236" },
        ],
      },
    ],
  },
  {
    code: "ECON200",
    title: "Principles of Micro-Economics",
    credits: 4,
    color: "orange",
    genEd: "DSSP",
    sections: [
      {
        code: "0101",
        instructor: "Daniel Novak",
        meetings: [
          { days: TUTH, start: t(14), end: t(15, 15), place: "VMH 1330" },
          {
            days: [2],
            start: t(15),
            end: t(15, 50),
            place: "TYD 0101",
            kind: "discussion",
          },
        ],
      },
    ],
  },
];

/** A block of busy time the student drew (Blocks): work, Friday 1–4pm. */
export const WORK_BLOCK = {
  label: "Work",
  day: 4 as Weekday,
  start: t(13),
  end: t(16),
};

/** What the demo can change: two sections, and a seat watch. */
export interface DemoState {
  ENGL393: "0101" | "0205";
  STAT400: "0101" | "0201";
  watching: boolean;
}

export const START: DemoState = {
  ENGL393: "0101",
  STAT400: "0101",
  watching: false,
};

/** The full section, and its waitlist. */
export const FULL_SECTION = {
  course: "CMSC351",
  section: "0301",
  waitlist: 12,
};

export const CREDITS = PLAN_A.reduce((sum, c) => sum + c.credits, 0);

function course(code: string): SampleCourse {
  const found = PLAN_A.find((c) => c.code === code);
  if (!found) throw new Error(`No ${code} in Plan A`);
  return found;
}

/** The section of `code` that `state` has placed. */
export function placedSection(state: DemoState, code: string): SampleSection {
  const c = course(code);
  const want =
    code === "ENGL393"
      ? state.ENGL393
      : code === "STAT400"
        ? state.STAT400
        : undefined;
  const found = want ? c.sections.find((s) => s.code === want) : c.sections[0];
  if (!found) throw new Error(`No ${code} ${want}`);
  return found;
}

/** A class on the week, with its column's lane when classes overlap. */
export interface WeekEntry {
  id: string;
  course: SampleCourse;
  section: SampleSection;
  day: Weekday;
  start: number;
  end: number;
  place: string;
  kind?: "discussion";
  lane: number;
  lanes: number;
}

/**
 * Every class on the week. Classes that overlap share their day's column
 * side by side, as the scheduler draws them. The id stays the same when a
 * course switches sections, so the block moves rather than reappears.
 */
export function weekEntries(state: DemoState): WeekEntry[] {
  const flat: Omit<WeekEntry, "lane" | "lanes">[] = [];
  for (const c of PLAN_A) {
    const s = placedSection(state, c.code);
    s.meetings.forEach((m, k) => {
      for (const day of m.days)
        flat.push({
          id: `${c.code}-${k}-${day}`,
          course: c,
          section: s,
          day,
          start: m.start,
          end: m.end,
          place: m.place,
          kind: m.kind,
        });
    });
  }
  return layOut(flat);
}

/** Lanes per day: each cluster of overlapping classes splits its column. */
export function layOut<T extends { day: number; start: number; end: number }>(
  entries: readonly T[],
): (T & { lane: number; lanes: number })[] {
  const out: (T & { lane: number; lanes: number })[] = [];
  const days = [...new Set(entries.map((e) => e.day))];
  for (const day of days) {
    const today = entries
      .filter((e) => e.day === day)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    let cluster: (T & { lane: number; lanes: number })[] = [];
    let clusterEnd = -1;
    const close = () => {
      const lanes = Math.max(0, ...cluster.map((e) => e.lane)) + 1;
      for (const e of cluster) e.lanes = lanes;
      out.push(...cluster);
      cluster = [];
    };
    for (const e of today) {
      if (e.start >= clusterEnd && cluster.length > 0) close();
      const taken = new Set(
        cluster.filter((o) => o.end > e.start).map((o) => o.lane),
      );
      let lane = 0;
      while (taken.has(lane)) lane++;
      cluster.push({ ...e, lane, lanes: 1 });
      clusterEnd = Math.max(clusterEnd, e.end);
    }
    close();
  }
  return out;
}

/** The walk the scheduler flags: STAT400 in ESJ to CMSC351 in CSI. */
export interface Walk {
  day: Weekday;
  /** Where the pill sits: halfway through the gap. */
  at: number;
  minutes: number;
}

/** ESJ to CSI at the typical pace (the mock geo data): 1,999 ft. */
const WALK_MINUTES = 8;

export function walksOf(state: DemoState): Walk[] {
  if (state.STAT400 !== "0101") return [];
  return MWF.map((day) => ({ day, at: t(10, 55), minutes: WALK_MINUTES }));
}

/** What a problem's button does. */
export type SampleFix =
  | { kind: "switch"; course: "ENGL393" | "STAT400"; to: string; label: string }
  | { kind: "watch" };

/** A row on the Problems tab, in the scheduler's words (src/core/problems). */
export interface SampleProblem {
  id: "overlap" | "tight-connection" | "full";
  title: string;
  detail: string;
  fix: SampleFix;
}

function dayList(days: readonly Weekday[]): string {
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

export function problemsOf(state: DemoState): SampleProblem[] {
  const out: SampleProblem[] = [];
  if (state.ENGL393 === "0101")
    out.push({
      id: "overlap",
      title: "CMSC330 and ENGL393 overlap",
      detail: `${dayList(TUTH)} 9:30am–10:45am`,
      fix: {
        kind: "switch",
        course: "ENGL393",
        to: "0205",
        label: "Switch ENGL393 to 0205",
      },
    });
  if (state.STAT400 === "0101")
    out.push({
      id: "tight-connection",
      title: "Tight connection from STAT400 to CMSC351",
      detail: `${WALK_MINUTES} min to get there, 10 min between classes · ${dayList(MWF)}`,
      fix: {
        kind: "switch",
        course: "STAT400",
        to: "0201",
        label: "Switch STAT400 to 0201",
      },
    });
  out.push({
    id: "full",
    title: `${FULL_SECTION.course} ${FULL_SECTION.section} is full`,
    detail: `${FULL_SECTION.waitlist} waitlisted.`,
    fix: { kind: "watch" },
  });
  return out;
}

/** "3 problems", "1 problem": the top bar's words. */
export function problemWords(n: number): string {
  return `${n} problem${n === 1 ? "" : "s"}`;
}

/** "9:30am", "12pm": the scheduler's clock. */
export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour = ((h + 11) % 12) + 1;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** "10–10:50am", "9:30am–10:45am": a block's time, as the calendar says it. */
export function clockRange(start: number, end: number): string {
  const a = clock(start);
  const b = clock(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -2)}–${b}` : `${a}–${b}`;
}
