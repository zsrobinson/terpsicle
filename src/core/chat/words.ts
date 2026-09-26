import type {
  CourseCode,
  InstructorName,
  Meeting,
  Minutes,
  Reaction,
  SectionCode,
} from "../schema";
import { formatDays, formatTime } from "../time";

// Plain words for room labels, details and descriptions (SPEC §3.13), in the
// Chat canvas's style: "Sadeghian · MWF 11am lecture", "0303 · TuTh 11am
// discussion", "People in section 0101 of CMSC131, from their plans".

/** "Pedram Sadeghian" → "Sadeghian", "Aaron Kyei-Asare" → "Kyei-Asare". */
export function instructorShortName(name: InstructorName): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

/** "" (TBA), "Rendall", "Rendall and Moss", "Rendall and 2 others". */
export function instructorsWords(
  instructors: readonly InstructorName[],
): string {
  const [first, second, ...rest] = instructors.map(instructorShortName);
  if (first === undefined) return "";
  if (second === undefined) return first;
  if (rest.length === 0) return `${first} and ${second}`;
  return `${first} and ${rest.length + 1} others`;
}

/** "1 section", "4 sections". */
export function countWords(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** "2–3:15pm", "11:30am–12:20pm": the start's am/pm goes when the end has the same. */
export function compactTimeRange(start: Minutes, end: Minutes): string {
  const from = formatTime(start);
  const to = formatTime(end);
  return from.slice(-2) === to.slice(-2)
    ? `${from.slice(0, -2)}–${to}`
    : `${from}–${to}`;
}

const OWN_KIND: Partial<Record<Meeting["kind"], string>> = {
  discussion: "discussion",
  lab: "lab",
};

/**
 * When meetings start, the way people say it: "MWF 11am", "TuTh 9:30am
 * discussion", "Tu 9am discussion and Th 2pm lab". Untimed meetings say so
 * ("online, no set time", "time TBA"); "" for no meetings at all.
 * `kinds: false` leaves out "discussion" and "lab" (a lecture room says
 * "lecture" once, after every time).
 */
export function startWords(
  meetings: readonly Meeting[],
  { kinds = true }: { kinds?: boolean } = {},
): string {
  const timed = meetings.flatMap((m) =>
    m.timed
      ? [
          [
            formatDays(m.days),
            formatTime(m.start),
            kinds ? OWN_KIND[m.kind] : undefined,
          ]
            .filter(Boolean)
            .join(" "),
        ]
      : [],
  );
  if (timed.length > 0) return [...new Set(timed)].join(" and ");
  if (meetings.length === 0) return "";
  return meetings.some((m) => m.online) ? "online, no set time" : "time TBA";
}

/** "MW 2–3:15pm", "MWF 10–10:50am, Th 2–2:50pm"; "" when nothing is timed. */
export function rangeWords(meetings: readonly Meeting[]): string {
  const timed = meetings.flatMap((m) =>
    m.timed
      ? [`${formatDays(m.days)} ${compactTimeRange(m.start, m.end)}`]
      : [],
  );
  return [...new Set(timed)].join(", ");
}

/** "IRB 0324", "CSI 2118, CSI 1121", "Online"; "" when nothing says where. */
export function placeWords(meetings: readonly Meeting[]): string {
  const places = meetings.flatMap((m) => {
    if (m.online) return [];
    const place = [m.building, m.room].filter(Boolean).join(" ");
    return place ? [place] : [];
  });
  if (places.length > 0) return [...new Set(places)].join(", ");
  // Untimed online meetings already say "online, no set time" in `startWords`.
  return meetings.some((m) => m.online && m.timed) ? "Online" : "";
}

/**
 * Section codes as a span: "0101", "0101 and 0102", "0301–0305" (when
 * they're consecutive in `order`), or "0101, 0103 and 0105".
 */
export function sectionCodesWords(
  codes: readonly SectionCode[],
  order: readonly SectionCode[],
): string {
  const [first, ...rest] = codes;
  if (first === undefined) return "";
  const last = rest[rest.length - 1];
  if (last === undefined) return first;
  if (rest.length === 1) return `${first} and ${last}`;
  const start = order.indexOf(first);
  const consecutive =
    start >= 0 && codes.every((code, i) => order[start + i] === code);
  if (consecutive) return `${first}–${last}`;
  return `${[first, ...rest.slice(0, -1)].join(", ")} and ${last}`;
}

/** Joins the non-empty parts with " · ". */
export function dotJoin(...parts: readonly string[]): string {
  return parts.filter((p) => p !== "").join(" · ");
}

// ---------- descriptions ----------

export function courseRoomDescription(
  courseCode: CourseCode,
  sectionCount: number,
): string {
  const everyone = `Everyone in ${courseCode} this term`;
  return sectionCount <= 1
    ? `${everyone}. It has one section, so this is its only room.`
    : everyone;
}

export function lectureRoomDescription(
  courseCode: CourseCode,
  codes: string,
  lecture: string,
): string {
  return `People in sections ${codes} of ${courseCode}, from their plans. They share ${lecture}.`;
}

export function sectionRoomDescription(
  courseCode: CourseCode,
  sectionCode: SectionCode,
): string {
  return `People in section ${sectionCode} of ${courseCode}, from their plans`;
}

// ---------- reactions ----------

/** Accessible names and tooltips for the reaction set. */
export const REACTION_WORDS = {
  thumbs: "Thumbs up",
  check: "Done",
  eyes: "Looking",
  laugh: "Funny",
  question: "Question",
} as const satisfies Record<Reaction, string>;
