import { weekdayOf } from "../ics/dates";
import {
  type AcademicCalendar,
  type BuildingCode,
  type ConnectionVerdict,
  type CourseCode,
  type IsoDate,
  type MeetingKind,
  type Minutes,
  type Plan,
  type SectionCode,
  type SectionKey,
  sectionKey,
  type TravelSettings,
} from "../schema";
import { dateSpansIntersect, type MeetingItem } from "../time/week";
import type { CampusMap } from "../travel/campus";
import {
  buildConnection,
  consecutivePairs,
  isStop,
} from "../travel/connections";

// Home's "Today" (docs/V3.md §1.5): the classes of the term in session's
// main plan that meet on a date, read from the plan's own snapshots, so it
// shows before any catalog loads and works offline. Between two classes in
// different campus buildings, the walk, as the scheduler's Travel tab works
// it out.

/** The walk to a class from the one before it. */
export type TodayWalk = {
  readonly from: BuildingCode;
  /** Minutes on foot plus your extra minutes; null until the routes file loads. */
  readonly minutes: number | null;
  readonly gapMinutes: number;
  readonly verdict: ConnectionVerdict;
};

export type TodayClass = {
  readonly sectionKey: SectionKey;
  readonly courseCode: CourseCode;
  readonly sectionCode: SectionCode;
  readonly kind: MeetingKind;
  readonly start: Minutes;
  readonly end: Minutes;
  readonly building: BuildingCode | null;
  readonly room: string | null;
  readonly online: boolean;
  /** Walking here from the class before, in another campus building. */
  readonly walk: TodayWalk | null;
};

export type ClassDay =
  /** The plan's classes that meet that day, by start time. */
  | { readonly kind: "classes"; readonly classes: readonly TodayClass[] }
  /** A break or holiday on the academic calendar ("Thanksgiving Break"). */
  | { readonly kind: "break"; readonly name: string }
  /** Nothing meets: a weekend, a day with no classes, or outside the term. */
  | { readonly kind: "none" };

/**
 * What the plan has on `date`. A published calendar decides whether classes
 * meet at all (first to last day of classes, and not in a break); a
 * section's own dates (a half-semester course) decide whether it does.
 */
export function classesOn(
  plan: Pick<Plan, "courses">,
  date: IsoDate,
  calendar: AcademicCalendar | null,
  travel: TravelSettings,
  campus: CampusMap,
): ClassDay {
  if (calendar?.status === "published") {
    if (date < calendar.classesStart || date > calendar.classesEnd)
      return { kind: "none" };
    const pause = calendar.noClasses.find(
      (b) => date >= b.start && date <= b.end,
    );
    if (pause) return { kind: "break", name: pause.name };
  }
  const day = weekdayOf(date);
  const items: {
    item: MeetingItem;
    sectionCode: SectionCode;
    kind: MeetingKind;
    online: boolean;
  }[] = [];
  for (const course of plan.courses) {
    const { sectionCode, snapshot } = course;
    if (sectionCode === null || snapshot === null) continue;
    const dates = snapshot.dates ?? null;
    if (!dateSpansIntersect(dates, { start: date, end: date })) continue;
    snapshot.meetings.forEach((m, meetingIndex) => {
      if (!m.timed || !m.days.includes(day)) return;
      items.push({
        sectionCode,
        kind: m.kind,
        online: m.online,
        item: {
          day,
          start: m.start,
          end: m.end,
          dates,
          source: {
            kind: "meeting",
            sectionKey: sectionKey(course.courseCode, sectionCode),
            courseCode: course.courseCode,
            meetingIndex,
            building: m.building,
            room: m.room,
            inPerson: !m.online && m.building !== null,
          },
        },
      });
    });
  }
  if (items.length === 0) return { kind: "none" };

  const stops = items.map((i) => i.item).filter((i) => isStop(i, campus));
  const walks = new Map<MeetingItem, TodayWalk>();
  for (const [from, to] of consecutivePairs(stops)) {
    const c = buildConnection(from, to, travel, campus);
    if (c)
      walks.set(to, {
        from: c.from.building,
        minutes: c.walkMinutes,
        gapMinutes: c.gapMinutes,
        verdict: c.verdict,
      });
  }

  const classes = items
    .map(({ item, sectionCode, kind, online }): TodayClass => {
      const { source } = item;
      return {
        sectionKey: source.sectionKey,
        courseCode: source.courseCode,
        sectionCode,
        kind,
        start: item.start,
        end: item.end,
        building: source.building,
        room: source.room,
        online,
        walk: walks.get(item) ?? null,
      };
    })
    .sort(
      (a, b) =>
        a.start - b.start ||
        a.end - b.end ||
        a.courseCode.localeCompare(b.courseCode),
    );
  return { kind: "classes", classes };
}

/**
 * The classes still to come, or under way, at `minutes` after midnight:
 * what "Today" lists. A class that has ended drops off.
 */
export function classesLeft(
  classes: readonly TodayClass[],
  minutes: Minutes,
): TodayClass[] {
  return classes.filter((c) => c.end > minutes);
}

/** Whether a class is under way at `minutes`. */
export function isUnderWay(
  c: Pick<TodayClass, "start" | "end">,
  minutes: Minutes,
): boolean {
  return c.start <= minutes && minutes < c.end;
}

/** "ESJ 0202", "ESJ", "Online", or null when Testudo lists no place. */
export function classPlaceWords(
  c: Pick<TodayClass, "building" | "room" | "online">,
): string | null {
  if (c.online) return "Online";
  if (c.building === null) return null;
  return c.room ? `${c.building} ${c.room}` : c.building;
}

/**
 * The walk in a few words: "8 min walk from IRB", with "Tight" first when
 * it takes most of the gap and "Not enough time" when it takes more. Never
 * red: it's information.
 */
export function walkWords(walk: TodayWalk): string {
  if (walk.verdict === "no-route")
    return `No route on UMD's map from ${walk.from}`;
  if (walk.minutes === null) return `From ${walk.from}`;
  const base = `${walk.minutes} min walk from ${walk.from}`;
  if (walk.verdict === "tight") return `Tight: ${base}`;
  if (walk.verdict === "insufficient")
    return `Not enough time: ${base}, ${walk.gapMinutes} min between`;
  return base;
}
