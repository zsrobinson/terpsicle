import type { SnapshotPart } from "../catalog/plan-diff";
import type {
  CourseCode,
  DateSpan,
  Day,
  Delivery,
  Meeting,
  Message,
  MessagePart,
  SectionKey,
  SectionSnapshot,
} from "../schema";
import { formatDateSpan } from "../time/format";

// Small builders for the structured text in problems (DATA §9).

export const text = (t: string): MessagePart => ({ kind: "text", text: t });
export const course = (courseCode: CourseCode): MessagePart => ({
  kind: "course",
  courseCode,
});
export const section = (sectionKey: SectionKey): MessagePart => ({
  kind: "section",
  sectionKey,
});
export const day = (d: Day): MessagePart => ({ kind: "day", day: d });
export const time = (minutes: number): MessagePart => ({
  kind: "time",
  minutes,
});
export const duration = (minutes: number): MessagePart => ({
  kind: "duration",
  minutes,
});

/** Joins groups of parts with a separator. */
export function joinParts(
  groups: readonly Message[],
  separator: string,
): Message {
  return groups.flatMap((g, i) => (i === 0 ? g : [text(separator), ...g]));
}

/** "M, W 10am–10:15am" as parts. */
export function daysAndTime(
  days: readonly Day[],
  start: number,
  end: number,
): Message {
  return [
    ...joinParts(
      days.map((d) => [day(d)]),
      ", ",
    ),
    text(" "),
    time(start),
    text("–"),
    time(end),
  ];
}

export const DELIVERY_WORDS = {
  f2f: "in person",
  blended: "blended",
  "online-sync": "online at set times",
  "online-async": "online with no set times",
} as const satisfies Record<Delivery, string>;

function meetingParts(m: Meeting): Message {
  if (!m.timed) return [text("no set times")];
  const where = m.online
    ? " online"
    : m.building
      ? ` in ${m.building}${m.room ? ` ${m.room}` : ""}`
      : "";
  return [
    ...daysAndTime(m.days, m.start, m.end),
    ...(where ? [text(where)] : []),
  ];
}

export function meetingsParts(meetings: readonly Meeting[]): Message {
  if (meetings.length === 0) return [text("no meetings listed")];
  return joinParts(meetings.map(meetingParts), "; ");
}

function datesText(span: DateSpan | undefined): string {
  return span ? formatDateSpan(span) : "the whole term";
}

function instructorsText(names: readonly string[]): string {
  return names.length ? names.join(", ") : "TBA";
}

/** "Now TuTh 11am–12:15pm in IRB 0318; was MWF 10am–10:50am in ESJ 0202." and friends. */
export function snapshotChangeParts(
  before: SectionSnapshot,
  after: SectionSnapshot,
  parts: readonly SnapshotPart[],
): Message {
  const sentences: Message[] = [];
  if (parts.includes("meetings"))
    sentences.push([
      text("Now "),
      ...meetingsParts(after.meetings),
      text("; was "),
      ...meetingsParts(before.meetings),
      text("."),
    ]);
  if (parts.includes("dates"))
    sentences.push([
      text(
        `Now meets ${datesText(after.dates)}; was ${datesText(before.dates)}.`,
      ),
    ]);
  if (parts.includes("instructors"))
    sentences.push([
      text(
        `Instructor is now ${instructorsText(after.instructors)}; was ${instructorsText(before.instructors)}.`,
      ),
    ]);
  if (parts.includes("delivery"))
    sentences.push([
      text(
        `Now ${DELIVERY_WORDS[after.delivery]}; was ${DELIVERY_WORDS[before.delivery]}.`,
      ),
    ]);
  return joinParts(sentences, " ");
}
