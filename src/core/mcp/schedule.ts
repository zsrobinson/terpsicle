import { buildCatalogIndex, snapshotOf } from "../catalog/catalog-index";
import { planProblems } from "../problems/problems";
import {
  type Course,
  type CourseCode,
  DAYS,
  type Day,
  type Message,
  type Plan,
  type Section,
  type SectionKey,
  type TermId,
  type TravelSettings,
} from "../schema";
import type { SeatsMap } from "../seats";
import {
  DAY_LONG_NAMES,
  formatDuration,
  formatTime,
  formatTimeRange,
} from "../time/format";
import type { CampusMap } from "../travel";

// check_schedule (docs/MCP.md): a set of sections run through the
// scheduler's own Problems (SPEC §3.6), as a plan would be, with each
// problem and its fix in plain text, and the week laid out by day.

/** A problem's structured message as one line of text. */
export function messageText(message: Message): string {
  return message
    .map((part) => {
      switch (part.kind) {
        case "text":
          return part.text;
        case "course":
          return part.courseCode;
        case "section":
          return part.sectionKey.replace("-", " ");
        case "block":
          return part.label;
        case "day":
          return DAY_LONG_NAMES[part.day];
        case "time":
          return formatTime(part.minutes);
        case "duration":
          return formatDuration(part.minutes);
        default:
          return "";
      }
    })
    .join("");
}

export type ScheduleProblemView = {
  severity: "error" | "warning" | "info";
  kind: string;
  title: string;
  detail: string;
  /** The scheduler's one-step fix ("Switch to CMSC351 0201"), when it has one. */
  fix: string | null;
};

export type ScheduleCheck = {
  credits: { min: number; max: number };
  /** By weekday, in order, each class's time, section and place. */
  week: Partial<Record<Day, string[]>>;
  /** Sections with no set times (online async, TBA). */
  untimed: string[];
  problems: ScheduleProblemView[];
};

/**
 * Problems for a schedule of `sections` (keys that `courses` all have),
 * as the scheduler finds them for a plan: overlaps, too little time to
 * walk between buildings, full or restricted sections, no set times.
 */
export function checkSchedule(input: {
  readonly termId: TermId;
  readonly courses: readonly Course[];
  readonly sections: readonly SectionKey[];
  readonly seats: SeatsMap | null;
  readonly campus: CampusMap;
  readonly travel: TravelSettings;
  /** For a stable plan; the plan is never saved. */
  readonly now: string;
}): ScheduleCheck {
  const index = buildCatalogIndex(input.termId, input.courses);
  const placed = input.sections.flatMap((key) => {
    const ref = index.sections.get(key);
    return ref ? [ref] : [];
  });
  const plan: Plan = {
    id: "mcp-check",
    termId: input.termId,
    name: "Schedule",
    order: 0,
    createdAt: input.now,
    updatedAt: input.now,
    courses: placed.map(({ course, section }) => ({
      courseCode: course.code,
      sectionCode: section.code,
      snapshot: snapshotOf(section),
    })),
  };
  const problems = planProblems({
    plan,
    index,
    blocks: [],
    travel: input.travel,
    campus: input.campus,
    seats: input.seats,
  });

  const { credits, week, untimed } = scheduleWeek(placed);
  return {
    credits,
    week,
    untimed,
    problems: problems.map((p) => ({
      severity: p.severity,
      kind: p.kind,
      title: messageText(p.title),
      detail: messageText(p.detail),
      fix:
        p.fix && p.fix.kind === "switch"
          ? `${p.fix.label} (${p.fix.sectionKey})`
          : (p.fix?.label ?? null),
    })),
  };
}

/** The week a set of sections makes: each weekday's classes in order, the untimed ones, and the credits. */
export function scheduleWeek(
  placed: readonly { readonly course: Course; readonly section: Section }[],
): Pick<ScheduleCheck, "credits" | "week" | "untimed"> {
  const rows: { day: Day; start: number; text: string }[] = [];
  const untimed: string[] = [];
  let min = 0;
  let max = 0;
  for (const { course, section } of placed) {
    min += course.credits.min;
    max += course.credits.max;
    const label = `${course.code} ${section.code}`;
    if (section.meetings.every((m) => !m.timed)) untimed.push(label);
    for (const m of section.meetings) {
      if (!m.timed) continue;
      const where = m.online
        ? "online"
        : m.building
          ? [m.building, m.room].filter(Boolean).join(" ")
          : "room TBA";
      const kind = m.kind === "lecture" ? "" : ` (${m.kind})`;
      for (const day of m.days)
        rows.push({
          day,
          start: m.start,
          text: `${formatTimeRange(m.start, m.end)} ${label}${kind} · ${where}`,
        });
    }
  }
  const week: Partial<Record<Day, string[]>> = {};
  for (const day of DAYS) {
    const today = rows
      .filter((r) => r.day === day)
      .sort((a, b) => a.start - b.start);
    if (today.length > 0) week[day] = today.map((r) => r.text);
  }
  return { credits: { min, max }, week, untimed };
}

/** The courses `keys` name, by code, in the order first named. */
export function coursesOf(keys: readonly SectionKey[]): CourseCode[] {
  return [...new Set(keys.map((k) => k.split("-")[0] ?? k))];
}
