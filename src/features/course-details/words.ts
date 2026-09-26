import type {
  Delivery,
  FitLabel,
  GenEdGroup,
  Meeting,
  Minutes,
  Section,
} from "~/core/schema";
import { GEN_ED_LABELS } from "~/core/schema";
import { formatDays, formatTime } from "~/core/time";

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

/** "9–9:50am", "11:30am–12:20pm": the start's am/pm goes when the end has the same. */
export function compactTimeRange(start: Minutes, end: Minutes): string {
  const from = formatTime(start);
  const to = formatTime(end);
  const suffix = from.slice(-2);
  return suffix === to.slice(-2)
    ? `${from.slice(0, -2)}–${to}`
    : `${from}–${to}`;
}

export interface MeetingWordsOptions {
  /** Say "discussion" or "lab" (off under a shared-lecture line, where it's implied). */
  kind?: boolean;
  /** Say the building and room (off in one-line rows). */
  place?: boolean;
}

/** "MWF 10–10:50am IRB 0324", "Tu 2–2:50pm ESJ 2101 discussion", "Online, no set times". */
export function meetingWords(
  meeting: Meeting,
  { kind: sayKind = true, place: sayPlace = true }: MeetingWordsOptions = {},
): string {
  const place = !sayPlace
    ? ""
    : meeting.online
      ? "online"
      : [meeting.building, meeting.room].filter(Boolean).join(" ");
  const kind = sayKind ? KIND[meeting.kind] : undefined;
  if (!meeting.timed)
    return meeting.online
      ? `Online, no set times${kind ? ` (${kind})` : ""}`
      : `Times TBA${place ? ` ${place}` : ""}${kind ? ` (${kind})` : ""}`;
  return [
    formatDays(meeting.days),
    compactTimeRange(meeting.start, meeting.end),
    place,
    kind,
  ]
    .filter(Boolean)
    .join(" ");
}

/** "Lec", "Dis", "Lab": a meeting's kind at the start of its line, and in full for the tooltip. */
export function meetingKindWords(kind: Meeting["kind"]): {
  short: string;
  long: string;
} {
  switch (kind) {
    case "lecture":
      return { short: "Lec", long: "Lecture" };
    case "discussion":
      return { short: "Dis", long: "Discussion" };
    case "lab":
      return { short: "Lab", long: "Lab" };
    case "other":
      return { short: "Mtg", long: "Meeting" };
  }
}

/** Every meeting, " · " between. Empty rows say to ask the department. */
export function sectionMeetingWords(section: Section): string {
  if (section.meetings.length === 0) return "Contact the department for times";
  return section.meetings.map((m) => meetingWords(m)).join(" · ");
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

/**
 * Testudo's permission flag in plain words (SPEC §3.13), read after the
 * "Permission" label. "Perm Req" is the only flag in the catalog today;
 * anything new shows as Testudo wrote it.
 */
const PERMISSION_WORDS: Record<string, string> = {
  "perm req": "Required from the department",
};

export function permissionWords(permission: string): string {
  return PERMISSION_WORDS[permission.trim().toLowerCase()] ?? permission;
}
