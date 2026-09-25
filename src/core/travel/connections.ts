import type { SectionRef } from "../catalog/catalog-index";
import {
  type Connection,
  connectionId,
  DAYS,
  type DateSpan,
  type Day,
  type TravelSettings,
} from "../schema";
import {
  dateSpansIntersect,
  type MeetingItem,
  sectionWeekItems,
} from "../time/week";
import type { CampusMap } from "./campus";
import { routeDistance } from "./routes-binary";
import { connectionVerdict, travelMode, walkMinutes } from "./walk";

// Connections (SPEC §3.7, DATA §6): consecutive timed, in-person meetings on
// one day in different buildings. Blocks, online meetings and off-campus
// meetings never take part.

/** A meeting that takes part in travel: timed, in person, in a campus building. */
export type Stop = MeetingItem;

export function isStop(item: MeetingItem, campus: CampusMap): boolean {
  const { inPerson, building } = item.source;
  return inPerson && building !== null && !campus.offCampus.has(building);
}

function intersection(a: DateSpan | null, b: DateSpan | null): DateSpan | null {
  if (a === null) return b;
  if (b === null) return a;
  return {
    start: a.start > b.start ? a.start : b.start,
    end: a.end < b.end ? a.end : b.end,
  };
}

/** `d` ends later than `c`, or at the same time but started later (it's the nearer one). */
function endsNearer(d: Stop, c: Stop): boolean {
  return d.end > c.end || (d.end === c.end && d.start > c.start);
}

/**
 * Whether you walk straight from `c` to `b`: `c` finishes before `b` starts,
 * they meet in the same weeks, and no other stop that meets in those weeks
 * sits between them (or runs into `b`). When something overlaps `b` there's
 * no connection: the overlap is its own problem.
 */
export function isConsecutive(
  c: Stop,
  b: Stop,
  stopsThatDay: readonly Stop[],
): boolean {
  if (c === b || c.day !== b.day) return false;
  if (!(c.start < b.start && c.end <= b.start)) return false;
  if (!dateSpansIntersect(c.dates, b.dates)) return false;
  const window = intersection(c.dates, b.dates);
  for (const d of stopsThatDay) {
    if (d === b || d === c || d.day !== b.day) continue;
    if (
      d.start < b.start &&
      endsNearer(d, c) &&
      dateSpansIntersect(d.dates, window)
    )
      return false;
  }
  return true;
}

/** Pairs of stops you walk between, in order of the second one's start. */
export function consecutivePairs(
  stopsThatDay: readonly Stop[],
): [Stop, Stop][] {
  const pairs: [Stop, Stop][] = [];
  for (const b of stopsThatDay)
    for (const c of stopsThatDay)
      if (isConsecutive(c, b, stopsThatDay)) pairs.push([c, b]);
  return pairs.sort(
    ([c1, b1], [c2, b2]) => b1.start - b2.start || c1.start - c2.start,
  );
}

/**
 * The connection from `from` to `to`, or null when both are in the same
 * building (no walk).
 */
export function buildConnection(
  from: Stop,
  to: Stop,
  settings: TravelSettings,
  campus: CampusMap,
): Connection | null {
  const a = from.source;
  const b = to.source;
  if (a.building === null || b.building === null || a.building === b.building)
    return null;
  const mode = travelMode(settings);
  const gapMinutes = to.start - from.end;
  const distance = campus.routes
    ? routeDistance(campus.routes, a.building, b.building, mode)
    : null;
  const distanceFeet = typeof distance === "number" ? distance : null;
  const walk =
    distanceFeet === null ? null : walkMinutes(distanceFeet, settings);
  return {
    id: connectionId(to.day, a, b),
    day: to.day,
    from: {
      sectionKey: a.sectionKey,
      meetingIndex: a.meetingIndex,
      building: a.building,
      room: a.room,
      time: from.end,
    },
    to: {
      sectionKey: b.sectionKey,
      meetingIndex: b.meetingIndex,
      building: b.building,
      room: b.room,
      time: to.start,
    },
    gapMinutes,
    distanceFeet,
    walkMinutes: walk,
    verdict:
      distance === "no-route"
        ? "no-route"
        : connectionVerdict(walk, gapMinutes),
    mode,
  };
}

/** Every stop of these sections, grouped by day. */
export function stopsByDay(
  sections: readonly Pick<SectionRef, "course" | "section">[],
  campus: CampusMap,
): Map<Day, Stop[]> {
  const byDay = new Map<Day, Stop[]>();
  for (const { course, section } of sections) {
    for (const item of sectionWeekItems(course.code, section)) {
      if (!isStop(item, campus)) continue;
      const list = byDay.get(item.day);
      if (list) list.push(item);
      else byDay.set(item.day, [item]);
    }
  }
  return byDay;
}

/**
 * All connections in a plan's placed sections, by day (week order) then time.
 * Verdicts are `unknown` until the routes file is loaded.
 */
export function planConnections(
  sections: readonly Pick<SectionRef, "course" | "section">[],
  settings: TravelSettings,
  campus: CampusMap,
): Connection[] {
  const byDay = stopsByDay(sections, campus);
  const out: Connection[] = [];
  for (const day of DAYS) {
    const stops = byDay.get(day);
    if (!stops) continue;
    for (const [from, to] of consecutivePairs(stops)) {
      const c = buildConnection(from, to, settings, campus);
      if (c) out.push(c);
    }
  }
  return out;
}

/** Connections grouped by day for the Travel tab, in week order. */
export function connectionsByDay(
  connections: readonly Connection[],
): { day: Day; connections: Connection[] }[] {
  return DAYS.flatMap((day) => {
    const list = connections.filter((c) => c.day === day);
    return list.length ? [{ day, connections: list }] : [];
  });
}
