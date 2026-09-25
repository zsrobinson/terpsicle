import type { Connection } from "~/core/schema";
import { DAY_LONG_NAMES, spokenTimeRange } from "~/core/time";
import { VERDICT_WORDS } from "~/core/travel";
import type { BlockEntry, ClassEntry, GhostEntry } from "./layout";

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
  return `${entry.courseCode} ${entry.sectionCode}${kind}, ${when(entry)}${place ? `, ${place}` : ""}`;
}

export function blockLabel(entry: BlockEntry): string {
  return `${entry.label}, ${when(entry)}`;
}

/** Ghosts are options, not classes in the plan, and say so. */
export function ghostLabel(entry: GhostEntry, courseCode: string): string {
  const facts = [entry.instructors || "instructor TBA"];
  if (entry.full) facts.push("full");
  if (entry.overlaps) facts.push("overlaps another class");
  const code = entry.sectionCodes[0] ?? "";
  if (entry.sectionCodes.length > 1)
    return `${entry.sectionCodes.length} sections of ${courseCode} to choose from, ${when(entry)}: pick one`;
  return `Switch to ${code}, another section of ${courseCode}: ${when(entry)}, ${facts.join(", ")}`;
}

/** "8 minute walk, tight. ESJ to CSI, 10 minutes between classes." */
export function pillLabel(c: Connection): string {
  const route = `${c.from.building} to ${c.to.building}`;
  if (
    c.walkMinutes === null ||
    c.verdict === "unknown" ||
    c.verdict === "no-route"
  )
    return `${VERDICT_WORDS[c.verdict]}. ${route}.`;
  const verdict = VERDICT_WORDS[c.verdict].toLowerCase();
  return `${c.walkMinutes} minute walk, ${verdict}. ${route}, ${c.gapMinutes} minutes between classes.`;
}
