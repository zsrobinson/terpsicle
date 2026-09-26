// Turns a real ELMS calendar feed into a fixture that's safe to commit
// (docs/V3.md §3.6): structure, UIDs, dates, course labels and URLs stay, so
// the golden tests see Canvas's real shape; anything that could be personal
// goes.
import {
  type ContentLine,
  looksLikeExam,
  matchFeedCourse,
  mentionsGradescope,
  parseContentLine,
  splitFeedTitle,
  unescapeText,
  unfoldLines,
} from "../../src/core/todo";

/** Properties kept as they are. Everything else is dropped, except the ones `redactLine` rewrites. */
const KEEP = new Set([
  "BEGIN",
  "END",
  "VERSION",
  "PRODID",
  "CALSCALE",
  "METHOD",
  "UID",
  "DTSTART",
  "DTEND",
  "DTSTAMP",
  "SEQUENCE",
  "STATUS",
  "CLASS",
  "ACTION",
  "TRIGGER",
  // VTIMEZONE's own lines.
  "TZID",
  "TZOFFSETFROM",
  "TZOFFSETTO",
  "TZNAME",
  "RRULE",
]);

export interface RedactOptions {
  /** Replace every title with a fixed fake ("Assignment 3", "Exam 1"). */
  fakeTitles: boolean;
  /** Goes in the calendar's name, so the fixture says what it is. */
  recordedOn: string;
}

const escapeText = (text: string) =>
  text.replace(/[\\;,]/g, (ch) => `\\${ch}`).replace(/\n/g, "\\n");

function serialize(name: string, line: ContentLine, value = line.value) {
  const params = Object.entries(line.params)
    .map(([k, v]) => `;${k}=${/[;:,]/.test(v) ? `"${v}"` : v}`)
    .join("");
  return `${name}${params}:${value}`;
}

/** Folds a content line at 75 characters, the leading space included, as RFC 5545 §3.1 asks. */
function fold(line: string): string {
  const parts = [line.slice(0, 75)];
  for (let at = 75; at < line.length; at += 74)
    parts.push(line.slice(at, at + 74));
  return parts.join("\r\n ");
}

/** One line outside or inside an event, rewritten; null drops it. */
function redactLine(
  line: ContentLine,
  summary: (text: string) => string,
  recordedOn: string,
): string | null {
  switch (line.name) {
    case "X-WR-CALNAME":
      // Canvas names the calendar after the person.
      return `X-WR-CALNAME:RECORDED FIXTURE ${recordedOn}`;
    case "SUMMARY":
      return `SUMMARY:${summary(unescapeText(line.value))}`;
    case "DESCRIPTION":
      return mentionsGradescope(unescapeText(line.value))
        ? "DESCRIPTION:Redacted. It mentioned gradescope.com."
        : "DESCRIPTION:Redacted.";
    case "URL":
      // A personal calendar's URL names the Canvas user.
      return serialize("URL", line, line.value.replace(/user_\d+/g, "user_0"));
    default:
      return KEEP.has(line.name) ? serialize(line.name, line) : null;
  }
}

export function redactFeed(text: string, options: RedactOptions): string {
  const out: string[] = [];
  const counts = new Map<string, number>();
  let event: ContentLine[] | null = null;

  const redactEvent = (lines: readonly ContentLine[]): string[] => {
    const uid = lines.find((l) => l.name === "UID")?.value ?? "";
    const summary = (text: string) => {
      const { title, courseLabel } = splitFeedTitle(text);
      const hasCourse = matchFeedCourse(courseLabel).length > 0;
      // A label with no course is the person's own calendar, named for them;
      // its titles are theirs too.
      const label = hasCourse ? courseLabel : courseLabel ? "Personal" : null;
      let kept = title;
      if (options.fakeTitles || !hasCourse) {
        const word = looksLikeExam(title)
          ? "Exam"
          : uid.startsWith("event-assignment-")
            ? "Assignment"
            : "Event";
        const n = (counts.get(word) ?? 0) + 1;
        counts.set(word, n);
        kept = `${word} ${n}`;
      }
      return escapeText(label ? `${kept} [${label}]` : kept);
    };
    return lines.flatMap(
      (l) => redactLine(l, summary, options.recordedOn) ?? [],
    );
  };

  for (const raw of unfoldLines(text)) {
    const line = parseContentLine(raw);
    if (!line) continue;
    const value = line.value.trim().toUpperCase();
    if (line.name === "BEGIN" && value === "VEVENT") {
      event = [];
    } else if (line.name === "END" && value === "VEVENT" && event) {
      out.push("BEGIN:VEVENT", ...redactEvent(event), "END:VEVENT");
      event = null;
    } else if (event) {
      event.push(line);
    } else {
      const kept = redactLine(line, (t) => t, options.recordedOn);
      if (kept !== null) out.push(kept);
    }
  }
  return `${out.map(fold).join("\r\n")}\r\n`;
}
