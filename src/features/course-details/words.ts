import type {
  Delivery,
  FitLabel,
  GenEdGroup,
  Meeting,
  SeatCounts,
  Section,
} from "~/core/schema";
import { GEN_ED_LABELS } from "~/core/schema";
import { seatLevel } from "~/core/seats";
import { formatDays, formatTime, formatTimeRange } from "~/core/time";

// Words for course details (SPEC §3.4): fit labels, meetings, delivery and
// gen-eds. Pure, so they're tested on their own.

/** Fits · Overlaps ENGL393 · Not enough time after CMSC330 · In your plan · No set times. */
export function fitWords(label: FitLabel): string {
  switch (label.kind) {
    case "fits":
      return "Fits";
    case "in-plan":
      return "In your plan";
    case "no-set-times":
      return "No set times";
    case "overlaps":
      return `Overlaps ${label.with.kind === "course" ? label.with.courseCode : label.with.label}`;
    case "not-enough-time":
      return `Not enough time ${label.direction} ${label.courseCode}`;
  }
}

/** One word or two, for compact rows; the full words go in the row's tooltip. */
export function shortFitWords(label: FitLabel): string {
  switch (label.kind) {
    case "fits":
      return "Fits";
    case "in-plan":
      return "In plan";
    case "no-set-times":
      return "No times";
    case "overlaps":
      return "Overlaps";
    case "not-enough-time":
      return "Too close";
  }
}

/** "Full", "2 left", "9 open": seats in a compact row. */
export function shortSeatWords(counts: SeatCounts | null): string {
  if (counts === null) return "Unknown";
  const level = seatLevel(counts);
  if (level === "full") return "Full";
  if (level === "low") return `${counts.open} left`;
  return `${counts.open} open`;
}

/** Calm tones: a label informs a choice, it doesn't alarm (DESIGN §5). */
export function fitTone(label: FitLabel): "ok" | "warn" | "plain" | "muted" {
  switch (label.kind) {
    case "fits":
      return "ok";
    case "overlaps":
    case "not-enough-time":
      return "warn";
    case "in-plan":
      return "plain";
    case "no-set-times":
      return "muted";
  }
}

const KIND: Partial<Record<Meeting["kind"], string>> = {
  discussion: "discussion",
  lab: "lab",
};

/** "MWF 10am–10:50am IRB 0324", "Tu 2pm–2:50pm ESJ 2101 discussion", "Online, no set times". */
export function meetingWords(meeting: Meeting): string {
  const place = meeting.online
    ? "online"
    : [meeting.building, meeting.room].filter(Boolean).join(" ");
  const kind = KIND[meeting.kind];
  if (!meeting.timed)
    return meeting.online
      ? `Online, no set times${kind ? ` (${kind})` : ""}`
      : `Times TBA${place ? ` ${place}` : ""}${kind ? ` (${kind})` : ""}`;
  return [
    formatDays(meeting.days),
    formatTimeRange(meeting.start, meeting.end),
    place,
    kind,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Every meeting, " · " between. Empty rows say to ask the department. */
export function sectionMeetingWords(section: Section): string {
  if (section.meetings.length === 0) return "Contact the department for times";
  return section.meetings.map(meetingWords).join(" · ");
}

/** Just the first meeting's days and start, for compact rows: "MWF 10am" (+2). */
export function compactMeetingWords(section: Section): string {
  const timed = section.meetings.filter((m) => m.timed);
  const first = timed[0];
  if (!first) return section.delivery === "online-async" ? "Online" : "TBA";
  const more = timed.length > 1 ? ` +${timed.length - 1}` : "";
  return `${formatDays(first.days)} ${formatTime(first.start)}${more}`;
}

/** A chip next to the section code, or null for in-person sections. */
export function deliveryWords(delivery: Delivery): string | null {
  switch (delivery) {
    case "f2f":
      return null;
    case "blended":
      return "Blended";
    case "online-sync":
      return "Online";
    case "online-async":
      return "Online, async";
  }
}

/** "DSNL (if taken with GEOL110) or DSNS": one gen-ed group, in words. */
export function genEdGroupWords(group: GenEdGroup): string {
  return group
    .map((o) => (o.condition ? `${o.code} (${o.condition})` : o.code))
    .join(" or ");
}

export function genEdLabel(code: string): string {
  return GEN_ED_LABELS[code] ?? code;
}
