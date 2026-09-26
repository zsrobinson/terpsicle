import type { Connection } from "~/core/schema";
import { DAY_LONG_NAMES, formatShortDate, spokenTimeRange } from "~/core/time";
import { VERDICT_WORDS } from "~/core/travel";
import {
  type BlockEntry,
  type ClassEntry,
  codeSpan,
  type GhostEntry,
} from "./layout";

// Accessible names for what's on the calendar. A screen reader moving through
// the grid hears each item whole, day included, since it can't see the
// column: "CMSC351 0301, Monday 11am to 11:50am, CSI 1115".

function when(entry: { day: ClassEntry["day"]; start: number; end: number }) {
  return `${DAY_LONG_NAMES[entry.day]} ${spokenTimeRange(entry.start, entry.end)}`;
}

export function classLabel(entry: ClassEntry): string {
  const kind =
    entry.meetingKind === "discussion" || entry.meetingKind === "lab"
      ? ` ${entry.meetingKind}`
      : "";
  const place = entry.online
    ? "online"
    : [entry.building, entry.room].filter(Boolean).join(" ");
  // Summer sessions (and some sections) meet for part of the term.
  const dates = entry.dates
    ? `, meets ${formatShortDate(entry.dates.start)} to ${formatShortDate(entry.dates.end)}`
    : "";
  return `${entry.courseCode} ${entry.sectionCode}${kind}, ${when(entry)}${place ? `, ${place}` : ""}${dates}`;
}

export function blockLabel(entry: BlockEntry): string {
  return `${entry.label}, ${when(entry)}`;
}

/**
 * Ghosts are options, not classes in the plan, and say so. Each name starts
 * with the section code the ghost shows, so a voice user can say what they
 * see (WCAG 2.5.3).
 */
export function ghostName(
  entry: GhostEntry,
  courseCode: string,
  { readOnly = false }: { readOnly?: boolean } = {},
): string {
  const facts: string[] = [];
  if (entry.sectionCodes.length <= 1)
    facts.push(entry.instructors || "instructor TBA");
  if (entry.full)
    facts.push(entry.sectionCodes.length > 1 ? "all full" : "full");
  if (entry.overlaps)
    facts.push(`overlaps ${entry.overlapsWith ?? "another class"}`);
  const code = entry.previewCode ?? entry.sectionCodes[0] ?? "";
  const about = [when(entry), ...facts].join(", ");
  if (entry.sectionCodes.length > 1) {
    const n = entry.sectionCodes.length;
    const choose = readOnly ? "Save a copy to change sections." : "Pick one.";
    return `${codeSpan(entry.sectionCodes)}, ${n} sections of ${courseCode} to choose from: ${about}. ${choose}`;
  }
  if (readOnly)
    return `${code}, another section of ${courseCode}: ${about}. Save a copy to change sections.`;
  return `Switch to ${code}, another section of ${courseCode}: ${about}`;
}

/**
 * "8 min walk, tight. ESJ to CSI, 10 minutes between classes." It starts
 * with the pill's own words ("8 min"), for voice control (WCAG 2.5.3).
 */
export function pillLabel(c: Connection): string {
  const route = `${c.from.building} to ${c.to.building}`;
  if (
    c.walkMinutes === null ||
    c.verdict === "unknown" ||
    c.verdict === "no-route"
  )
    return `${VERDICT_WORDS[c.verdict]}. ${route}.`;
  const verdict = VERDICT_WORDS[c.verdict].toLowerCase();
  return `${c.walkMinutes} min walk, ${verdict}. ${route}, ${c.gapMinutes} minutes between classes.`;
}
