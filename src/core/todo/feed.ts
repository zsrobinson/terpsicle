import { addDays } from "../ics/dates";
import type {
  AcademicCalendar,
  CourseCode,
  FeedItemKind,
  IsoDate,
  SectionCode,
  TermId,
} from "../schema";

// What a feed item's words say: its course, whether it reads like an exam,
// and (for a file that doesn't say) whether it's an assignment. docs/V3.md §3.6.

/**
 * Canvas titles end with the course in brackets:
 * "Project 2 [CMSC216-0103: Introduction to Computer Systems]". The last
 * bracket at the end is the label; the rest is the title. A title with no
 * such bracket has no label.
 */
export function splitFeedTitle(summary: string): {
  title: string;
  courseLabel: string | null;
} {
  const trimmed = summary.trim();
  const match = /^(.*)\[([^[\]]*)\]$/s.exec(trimmed);
  const label = match?.[2]?.trim() ?? "";
  if (!match || label === "") return { title: trimmed, courseLabel: null };
  const title = (match[1] ?? "").trim();
  return { title: title === "" ? trimmed : title, courseLabel: label };
}

export interface FeedCourse {
  code: CourseCode;
  sectionCode: SectionCode | null;
}

const LABEL_CODE =
  /(?<![A-Z0-9])([A-Z]{4}\d{3}[A-Z]?)(?:-([A-Z0-9]{4}))?(?![A-Z0-9])/g;

/**
 * Every course in a label, in order and once each, with its section when the
 * label gives one: "CMSC216-0103: …" → CMSC216 / 0103; a cross-listing
 * "CMSC216/ENEE222-0101: …" → CMSC216, then ENEE222 / 0101.
 */
export function matchFeedCourse(label: string | null): FeedCourse[] {
  if (!label) return [];
  const out: FeedCourse[] = [];
  for (const match of label.matchAll(LABEL_CODE)) {
    const code = match[1];
    if (!code || out.some((c) => c.code === code)) continue;
    out.push({ code, sectionCode: match[2] ?? null });
  }
  return out;
}

/**
 * The course to color an item with: the first of its codes that's in the
 * person's plan for the item's term, else its first code, else null.
 */
export function pickFeedCourse(
  codes: readonly CourseCode[],
  planCourses: Iterable<CourseCode>,
): CourseCode | null {
  const inPlan = new Set(planCourses);
  return codes.find((code) => inPlan.has(code)) ?? codes[0] ?? null;
}

const EXAM_WORDS = /\b(exams?|midterms?|finals?|quiz(?:zes)?|tests?)\b/i;
/** Titles that use an exam word for something that isn't one. */
const NOT_EXAMS =
  /\bfinals?\s+(projects?|papers?|reports?|presentations?|essays?|portfolios?|drafts?|submissions?|reflections?)\b|\btest\s+cases?\b/gi;

/**
 * Whether a title reads like an exam or quiz. A guess from keywords, never a
 * fact: it only marks the item "Exam" and dashes it on the week.
 */
export function looksLikeExam(title: string): boolean {
  return EXAM_WORDS.test(title.replace(NOT_EXAMS, " "));
}

// Exams aren't here: Canvas puts them on the calendar as events.
const ASSIGNMENT_WORDS =
  /\b(due|assignments?|homeworks?|hw\s?\d*|projects?|labs?|quiz(?:zes)?|essays?|papers?|problem\s+sets?|psets?|submissions?|worksheets?|responses?|reflections?|drafts?|readings?)\b/i;

/**
 * An item's kind. Canvas says so in the UID (`event-assignment-…`,
 * `event-calendar-event-…`); anything else is a guess from the title, and
 * `from` says which.
 */
export function feedItemKind(
  uid: string,
  title: string,
  gradescope: boolean,
): { kind: FeedItemKind; from: "uid" | "title" } {
  if (/^event-assignment-/i.test(uid))
    return { kind: "assignment", from: "uid" };
  if (/^event-calendar-event-/i.test(uid))
    return { kind: "event", from: "uid" };
  const assignment = gradescope || ASSIGNMENT_WORDS.test(title);
  return { kind: assignment ? "assignment" : "event", from: "title" };
}

/** Whether a URL or description mentions Gradescope's site (docs/V3.md §3.7). */
export function mentionsGradescope(...texts: (string | null)[]): boolean {
  return texts.some((text) => text !== null && /gradescope\.com/i.test(text));
}

/**
 * The term an item belongs to: the published calendar whose span (first day
 * of classes through 14 days after the last, for finals and grades) holds
 * the date. Where spans overlap (winter's grace and spring's start), the term
 * whose classes started last wins. Null outside every span.
 */
export function termForDate(
  date: IsoDate,
  calendars: readonly AcademicCalendar[],
): TermId | null {
  let best: { termId: TermId; start: IsoDate } | null = null;
  for (const calendar of calendars) {
    if (calendar.status !== "published") continue;
    const { classesStart, classesEnd, termId } = calendar;
    if (date < classesStart || date > addDays(classesEnd, 14)) continue;
    if (!best || classesStart > best.start)
      best = { termId, start: classesStart };
  }
  return best?.termId ?? null;
}
