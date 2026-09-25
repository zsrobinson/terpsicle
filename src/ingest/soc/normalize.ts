import {
  type Course,
  CourseCodeSchema,
  type CourseNote,
  DAYS,
  type Day,
  type Delivery,
  type GenEdGroup,
  type Meeting,
  type MeetingKind,
  type SeatTuple,
  type Section,
  SectionCodeSchema,
} from "~/core/schema";
import { squash } from "../html";
import { parseClock, parseLongDate } from "../time";
import {
  LABEL_END,
  LABEL_START,
  LINE_BREAK,
  type RawCourse,
  type RawGenEd,
} from "./parse-department";
import type {
  RawCourseSections,
  RawMeetingRow,
  RawSection,
} from "./parse-sections";

// Raw SOC records → the published catalog shapes (DATA.md §3.2).

export type NormalizedSection = Section;

export interface NormalizedCourseSections {
  sections: NormalizedSection[];
  /** Section code → seats; sections without counts are absent. */
  seats: Map<string, SeatTuple>;
  /** Why sections were dropped (invalid code, duplicate), for the job log. */
  skipped: string[];
}

const TBA_INSTRUCTOR = /^(instructor:\s*)?tba$/i;

export function parseDays(text: string | null): Day[] | null {
  if (!text) return null;
  const tokens = text.match(/Tu|Th|Sa|Su|M|W|F/g);
  if (!tokens || tokens.join("") !== text) return null;
  const set = new Set(tokens as Day[]);
  return DAYS.filter((d) => set.has(d));
}

function meetingKind(type: string | null): MeetingKind {
  if (!type) return "lecture";
  const t = type.toLowerCase();
  if (t === "discussion") return "discussion";
  if (t === "lab") return "lab";
  if (t === "lecture") return "lecture";
  return "other";
}

/** One Testudo row → a meeting, or null for rows that carry no meeting ("Contact department…"). */
export function normalizeMeeting(row: RawMeetingRow): Meeting | null {
  const kind = meetingKind(row.type);
  if (row.elms) {
    return { timed: false, kind, building: null, room: null, online: true };
  }
  const online = row.room?.toUpperCase() === "ONLINE";
  const building =
    online || !row.building || row.building.toUpperCase() === "TBA"
      ? null
      : row.building.toUpperCase();
  const room = online || !building || !row.room ? null : row.room.slice(0, 16);
  const place = { kind, building, room, online };

  const days = parseDays(row.days);
  const start = parseClock(row.start);
  const end = parseClock(row.end);
  if (
    days &&
    days.length > 0 &&
    start !== null &&
    end !== null &&
    end > start
  ) {
    return { timed: true, days, start, end, ...place };
  }
  if (!row.days && !row.start && !building && !online && !row.room) {
    // Nothing at all: a message-only row.
    return null;
  }
  return { timed: false, ...place };
}

function deliveryOf(raw: RawSection, meetings: readonly Meeting[]): Delivery {
  if (raw.delivery === "blended") return "blended";
  if (raw.delivery === "online") {
    return meetings.some((m) => m.timed) ? "online-sync" : "online-async";
  }
  return "f2f";
}

/**
 * A sentence that limits who can register. Checked over every section note on
 * the four saved terms: "Restricted to …", "This section is restricted to …",
 * "Registration is restricted to …", "Reserved for …", "Restriction: …",
 * "Must be in the … program", "Only open to …", "Limited to …", "Golden ID
 * students are not eligible …". Links ("Click here …") aren't restrictions.
 */
const RESTRICTION =
  /\b(restrict(ed|ion|s)?|reserved for|limited to|not eligible|open only to|only open to)\b|^must (be|have)\b/i;

/**
 * The sentences of a section's notes that restrict who can register, joined
 * with a space, with any "Restriction:" label dropped; null when none do
 * (DATA.md §3.2).
 */
export function restrictionOf(notes: string | null): string | null {
  if (!notes) return null;
  const sentences = notes
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/^Restrictions?:\s*/i, "").trim())
    .filter((s) => s && RESTRICTION.test(s));
  return sentences.length > 0 ? sentences.join(" ") : null;
}

export function normalizeSections(
  course: RawCourseSections,
): NormalizedCourseSections {
  const out: NormalizedSection[] = [];
  const seats = new Map<string, SeatTuple>();
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const raw of course.sections) {
    const code = raw.code.toUpperCase();
    if (!SectionCodeSchema.safeParse(code).success) {
      skipped.push(
        `${course.course}: section code "${raw.code}" isn't four letters or digits`,
      );
      continue;
    }
    if (seen.has(code)) {
      skipped.push(`${course.course}-${code}: listed twice; kept the first`);
      continue;
    }
    seen.add(code);

    const meetings = raw.rows
      .map(normalizeMeeting)
      .filter((m): m is Meeting => m !== null);
    const texts = [...raw.texts];
    if (raw.footnote && course.footnote) texts.push(course.footnote);
    const notes = squash(texts.join(" ")) || null;
    const section: NormalizedSection = {
      code,
      // Sorted: Testudo lists co-instructors in a different order from one
      // request to the next, which would read as a change every run.
      instructors: [
        ...new Set(
          raw.instructors
            .map(squash)
            .filter((name) => name && !TBA_INSTRUCTOR.test(name)),
        ),
      ].sort(),
      delivery: deliveryOf(raw, meetings),
      meetings,
      notes,
      restriction: restrictionOf(notes),
    };
    const start = parseLongDate(raw.startDate);
    const end = parseLongDate(raw.endDate);
    if (start && end && end >= start) section.dates = { start, end };
    out.push(section);

    if (raw.open !== null && raw.total !== null) {
      // Waitlist and holdfile stay null when Testudo doesn't show them.
      seats.set(code, [raw.open, raw.total, raw.waitlist, raw.holdfile]);
    }
  }
  out.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { sections: out, seats, skipped };
}

// ---------- courses ----------

const COURSE_CODE = /\b[A-Z]{4}\d{3}[A-Z]?\b/g;

type TextField = "prerequisite" | "corequisite" | "restriction";

const LABEL_FIELDS: Record<string, TextField | "crossListings"> = {
  prerequisite: "prerequisite",
  prerequisites: "prerequisite",
  corequisite: "corequisite",
  corequisites: "corequisite",
  restriction: "restriction",
  restrictions: "restriction",
  "cross-listed with": "crossListings",
  "also offered as": "crossListings",
  "jointly offered with": "crossListings",
};

/**
 * Labels recognised inside free-text (`course-text`) notes, at the start or
 * after a sentence. Split with a capture group: [before, label, text, label, text…].
 */
const INLINE_LABEL =
  /(?:^|(?<=[.;)]\s))(Prerequisites?|Corequisites?|Restrictions?|Credit only granted for|Formerly|Additional information|Recommended|Cross-listed with|Jointly offered with|Also offered as|Note):\s*/i;

/** Testudo repeats the individual-instruction message inside some notes. */
const INDIVIDUAL_INSTRUCTION =
  "Contact department for information to register for this course.";

interface CourseText {
  description: string[];
  fields: Partial<Record<TextField, string>>;
  crossListings: string[];
  otherNotes: CourseNote[];
}

function addLabeled(into: CourseText, rawLabel: string, rawText: string) {
  const label = squash(rawLabel).replace(/:$/, "").trim();
  const text = squash(rawText);
  if (!label) {
    if (text) into.description.push(text);
    return;
  }
  const field = LABEL_FIELDS[label.toLowerCase()];
  if (field === "crossListings") {
    into.crossListings.push(...(text.match(COURSE_CODE) ?? []));
    return;
  }
  if (!text) return;
  if (field) {
    const prev = into.fields[field];
    into.fields[field] = prev ? `${prev} ${text}` : text;
    return;
  }
  if (!into.otherNotes.some((n) => n.label === label && n.text === text)) {
    into.otherNotes.push({ label: label.slice(0, 60), text });
  }
}

/** Splits a block with LABEL_START/LABEL_END markers into (label, text) pieces. */
function labeledPieces(block: string): { label: string; text: string }[] {
  const pieces: { label: string; text: string }[] = [];
  const [head = "", ...rest] = block.split(LABEL_START);
  if (squash(head)) pieces.push({ label: "", text: head });
  for (const part of rest) {
    const end = part.indexOf(LABEL_END);
    if (end < 0) pieces.push({ label: "", text: part });
    else pieces.push({ label: part.slice(0, end), text: part.slice(end + 1) });
  }
  return pieces;
}

export function splitCourseText(
  raw: Pick<RawCourse, "approvedTexts" | "courseTexts">,
): CourseText {
  const out: CourseText = {
    description: [],
    fields: {},
    crossListings: [],
    otherNotes: [],
  };
  for (const block of raw.approvedTexts) {
    for (const { label, text } of labeledPieces(
      block.replaceAll(LINE_BREAK, " "),
    )) {
      // A block can hold a second, unmarked label: "…ANTH665. Credit only granted for: …".
      const parts = squash(text).split(INLINE_LABEL);
      addLabeled(out, label, parts[0] ?? "");
      for (let i = 1; i < parts.length; i += 2) {
        addLabeled(out, parts[i] ?? "", parts[i + 1] ?? "");
      }
    }
  }
  // Unapproved free text: "Prerequisite: … Additional information: …<br><br>
  // Description…". Labels can start a line or follow a sentence.
  for (const block of raw.courseTexts) {
    const flat = block.replaceAll(LABEL_START, "").replaceAll(LABEL_END, "");
    for (const line of flat.split(LINE_BREAK)) {
      const text = squash(line.replaceAll(INDIVIDUAL_INSTRUCTION, " "));
      if (!text) continue;
      const parts = text.split(INLINE_LABEL);
      if (parts[0]) out.description.push(parts[0]);
      for (let i = 1; i < parts.length; i += 2) {
        addLabeled(out, parts[i] ?? "", parts[i + 1] ?? "");
      }
    }
  }
  return out;
}

/**
 * Testudo's gen-ed list → groups that all apply; options joined by "or" share
 * a group. "DSNL (if taken with GEOL110) or DSNS, SCIS" →
 * [[{DSNL, "if taken with GEOL110"}, {DSNS}], [{SCIS}]].
 */
export function genEdGroups(genEds: readonly RawGenEd[]): GenEdGroup[] {
  const groups: GenEdGroup[] = [];
  for (const [i, g] of genEds.entries()) {
    const code = g.code.toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) continue;
    const condition = g.condition
      ? squash(g.condition.replace(/^\(|\)$/g, "")).slice(0, 120)
      : "";
    const option = condition ? { code, condition } : { code };
    const last = groups[groups.length - 1];
    if (i > 0 && last && /\bor\b/i.test(g.separator)) {
      if (!last.some((o) => o.code === code)) last.push(option);
    } else {
      groups.push([option]);
    }
  }
  return groups;
}

function credits(text: string | null): number | null {
  if (!text) return null;
  const n = Number.parseFloat(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** A raw course (sections attached separately) → the published course. */
export function normalizeCourse(
  raw: RawCourse,
  sections: readonly NormalizedSection[],
): Course {
  const text = splitCourseText(raw);
  const min = credits(raw.minCredits) ?? 0;
  const max = Math.max(min, credits(raw.maxCredits) ?? min);
  const code = raw.code.toUpperCase();
  const crossListings = [...new Set(text.crossListings)].filter(
    (c) => c !== code && CourseCodeSchema.safeParse(c).success,
  );
  return {
    code,
    title: squash(raw.title) || code,
    credits: { min, max },
    genEds: genEdGroups(raw.genEds),
    gradingMethods: [
      ...new Set(raw.grading.flatMap((g) => g.split(",")).map(squash)),
    ].filter(Boolean),
    permission: raw.permission ? squash(raw.permission) || null : null,
    description: text.description.join(" ") || null,
    prerequisite: text.fields.prerequisite ?? null,
    corequisite: text.fields.corequisite ?? null,
    restriction: text.fields.restriction ?? null,
    otherNotes: text.otherNotes,
    crossListings,
    ...(raw.individualInstruction ? { contactDepartment: true as const } : {}),
    sections: [...sections],
  };
}
