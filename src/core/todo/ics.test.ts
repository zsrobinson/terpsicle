import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { aFeedItem } from "~/fixtures";
import { type FeedItem, type IcsParse, IcsParseSchema } from "../schema";
import { FEEDS } from "./__fixtures__/feeds";
import {
  parseContentLine,
  parseIcs,
  readWhen,
  unescapeText,
  unfoldLines,
} from "./ics";

const feed = (name: string) => {
  const saved = FEEDS[name];
  if (!saved) throw new Error(`No feed ${name}`);
  return parseIcs(saved.text, saved.source);
};
const elms = feed("synthetic-elms-2026-09");
const file = feed("synthetic-file-gradescope");

const item = (parse: IcsParse, uid: string): FeedItem => {
  const found = parse.items.find((i) => i.uid === uid);
  if (!found) throw new Error(`${uid} wasn't read`);
  return found;
};

/** One JSON object per item, so a golden diff shows exactly what changed. */
function outline(parse: IcsParse): string {
  return [
    `recognized: ${parse.recognized}`,
    `skipped: ${parse.skipped}`,
    "",
    ...parse.items.map((i) => JSON.stringify(i)),
    "",
  ].join("\n");
}

const vcalendar = (...lines: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR"].join("\r\n");
const vevent = (...lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"];

describe("golden feeds", () => {
  it.each(Object.keys(FEEDS))("%s", async (name) => {
    const parse = feed(name);
    expect(IcsParseSchema.parse(parse)).toEqual(parse);
    expect(parse.recognized).toBe(true);
    expect(parse.items.length).toBeGreaterThan(0);
    await expect(outline(parse)).toMatchFileSnapshot(
      `__fixtures__/${name}.golden.txt`,
    );
  });

  it("keeps the ELMS fixture's CRLF line ends and the file's LF ones", () => {
    expect(FEEDS["synthetic-elms-2026-09"]?.text).toContain("\r\n");
    expect(FEEDS["synthetic-file-gradescope"]?.text).not.toContain("\r");
  });

  it("marks the fixtures as synthetic", () => {
    for (const [name, { text }] of Object.entries(FEEDS))
      if (name.startsWith("synthetic-"))
        expect(unfoldLines(text).join("\n")).toMatch(/SYNTHETIC FIXTURE/);
  });
});

describe("parseIcs: an ELMS feed", () => {
  it("reads an assignment: title, course, section, due time and link", () => {
    expect(item(elms, "event-assignment-4410001")).toEqual(
      aFeedItem({
        uid: "event-assignment-4410001",
        title: "Project 2",
        courseLabel: "CMSC216-0103: Introduction to Computer Systems",
        courseCodes: ["CMSC216"],
        sectionCode: "0103",
        kind: "assignment",
        kindFrom: "uid",
        looksLikeExam: false,
        gradescope: false,
        dueAt: "2026-09-30T03:59:00.000Z",
        dueDate: "2026-09-29",
        endAt: null,
        link: "https://elms.umd.edu/calendar?include_contexts=course_1300001&month=09&year=2026#assignment_4410001",
      }),
    );
  });

  it("dedupes by UID", () => {
    const uids = elms.items.map((i) => i.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(uids.filter((u) => u === "event-assignment-4410001")).toHaveLength(
      1,
    );
  });

  it("reads a calendar event as an event, with its end", () => {
    expect(item(elms, "event-calendar-event-880001")).toMatchObject({
      kind: "event",
      kindFrom: "uid",
      looksLikeExam: true,
      dueAt: "2026-10-08T17:00:00.000Z",
      endAt: "2026-10-08T18:15:00.000Z",
    });
  });

  it("reads an all-day item as its date, with no time", () => {
    expect(item(elms, "event-assignment-4410006")).toMatchObject({
      dueAt: null,
      dueDate: "2026-10-05",
      endAt: null,
    });
  });

  it("unfolds long lines and unescapes text", () => {
    expect(item(elms, "event-assignment-4410004").courseLabel).toBe(
      "CMSC216-0103: Introduction to Computer Systems",
    );
    expect(item(elms, "event-assignment-4410007")).toMatchObject({
      title: "Essay 1: Rhetoric, Audience; Purpose",
      courseLabel: "ENGL101-0501: Academic Writing",
    });
  });

  it("guesses exams from the title, and knows a final project isn't one", () => {
    expect(item(elms, "event-assignment-4410003").looksLikeExam).toBe(true);
    expect(item(elms, "event-assignment-4410012").looksLikeExam).toBe(true);
    expect(item(elms, "event-assignment-4410004").looksLikeExam).toBe(false);
  });

  it("flags Gradescope from the description, not from an alarm inside the event", () => {
    expect(item(elms, "event-assignment-4410005").gradescope).toBe(true);
    expect(item(elms, "event-calendar-event-880003")).toMatchObject({
      gradescope: false,
      title: "Office hours [moved to IRB 1116]",
    });
  });

  it("reads every course in a cross-listed or merged label", () => {
    expect(item(elms, "event-assignment-4410010")).toMatchObject({
      courseCodes: ["CMSC216", "ENEE222"],
      sectionCode: null,
    });
    expect(item(elms, "event-assignment-4410011")).toMatchObject({
      courseLabel:
        "BSCI170-0101,0102,0103: Principles of Molecular & Cellular Biology",
      courseCodes: ["BSCI170"],
      sectionCode: "0101",
    });
  });

  it("keeps a label with no course code, with no codes", () => {
    expect(item(elms, "event-calendar-event-880002")).toMatchObject({
      courseLabel: "Sam Testudo",
      courseCodes: [],
      sectionCode: null,
    });
  });

  it("skips and counts events it can't read", () => {
    expect(elms.skipped).toBe(2);
    expect(elms.items.map((i) => i.uid)).not.toContain(
      "event-assignment-4410013",
    );
    expect(elms.items).toHaveLength(15);
  });

  it("never keeps a description", () => {
    expect(JSON.stringify(elms)).not.toContain("tiny shell");
  });
});

describe("parseIcs: time zones", () => {
  it("dates a UTC due time in New York, across midnight", () => {
    // 3:59 UTC is 11:59pm the day before in New York.
    expect(item(elms, "event-assignment-4410002")).toMatchObject({
      dueAt: "2026-10-01T03:59:00.000Z",
      dueDate: "2026-09-30",
    });
  });

  it("dates both 1:30ams of the night daylight time ends", () => {
    expect(item(elms, "event-assignment-4410008").dueDate).toBe("2026-11-01"); // 1:59am EDT
    expect(item(elms, "event-assignment-4410009").dueDate).toBe("2026-11-01"); // 1:30am EST
    expect(item(elms, "event-assignment-4410010").dueDate).toBe("2026-11-01"); // 11:59pm EST
    expect(item(elms, "event-assignment-4410011").dueDate).toBe("2026-11-02"); // midnight EST
  });

  it("reads TZID=America/New_York in daylight and standard time", () => {
    expect(item(file, "gradescope-2700101@export.invalid")).toMatchObject({
      dueAt: "2026-11-05T04:59:00.000Z",
      dueDate: "2026-11-04",
    });
    expect(item(file, "gradescope-2700111@export.invalid")).toMatchObject({
      dueAt: "2026-10-16T14:00:00.000Z",
      endAt: "2026-10-16T15:00:00.000Z",
    });
  });

  it("reads a repeated local time as the first one (RFC 5545 §3.3.5)", () => {
    expect(item(file, "gradescope-2700102@export.invalid").dueAt).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });

  it("reads a skipped local time with the offset before the gap", () => {
    // 2:30am on the night clocks jump to 3am: 2:30 EST, which is 3:30 EDT.
    expect(item(file, "gradescope-2700103@export.invalid")).toMatchObject({
      dueAt: "2027-03-14T07:30:00.000Z",
      dueDate: "2027-03-14",
    });
  });

  it("reads another zone and dates it in New York", () => {
    // 11:59pm in Chicago is 12:59am the next day in New York.
    expect(item(file, "gradescope-2700104@export.invalid")).toMatchObject({
      dueAt: "2026-10-16T04:59:00.000Z",
      dueDate: "2026-10-16",
    });
  });

  it("reads a floating time in New York", () => {
    expect(item(file, "gradescope-2700105@export.invalid").dueAt).toBe(
      "2026-10-20T16:00:00.000Z",
    );
  });

  it("reads Outlook's zone names", () => {
    expect(item(file, "gradescope-2700107@export.invalid")).toMatchObject({
      dueAt: "2026-12-11T04:59:00.000Z",
      dueDate: "2026-12-10",
    });
  });

  it("skips an event in a zone it can't place", () => {
    expect(file.items.map((i) => i.uid)).not.toContain(
      "gradescope-2700109@export.invalid",
    );
    expect(file.skipped).toBe(1);
  });

  it("reads all-day items in a file", () => {
    expect(item(file, "gradescope-2700106@export.invalid")).toMatchObject({
      dueAt: null,
      dueDate: "2026-12-01",
      kind: "event",
      looksLikeExam: true,
    });
  });
});

describe("parseIcs: a dropped file", () => {
  it("marks every item as from a file", () => {
    expect(new Set(file.items.map((i) => i.source))).toEqual(new Set(["file"]));
  });

  it("flags Gradescope links, and keeps only ELMS links", () => {
    expect(item(file, "gradescope-2700101@export.invalid")).toMatchObject({
      gradescope: true,
      link: null,
      courseCodes: ["MATH240"],
      sectionCode: null,
    });
  });

  it("guesses the kind from the title when the UID doesn't say, and says it guessed", () => {
    expect(item(file, "gradescope-2700105@export.invalid")).toMatchObject({
      kind: "assignment",
      kindFrom: "title",
    });
    expect(item(file, "gradescope-2700111@export.invalid")).toMatchObject({
      kind: "event",
      kindFrom: "title",
    });
  });

  it("keeps the higher SEQUENCE of a repeated UID", () => {
    expect(item(file, "gradescope-2700108@export.invalid").dueDate).toBe(
      "2026-11-12",
    );
  });

  it("leaves cancelled events out without counting them", () => {
    expect(file.items.map((i) => i.uid)).not.toContain(
      "gradescope-2700110@export.invalid",
    );
    expect(file.items).toHaveLength(9);
  });
});

describe("parseIcs: edges", () => {
  it("isn't recognized without BEGIN:VCALENDAR", () => {
    for (const text of ["", "hello", vevent("UID:a").join("\r\n")])
      expect(parseIcs(text)).toEqual({
        recognized: false,
        items: [],
        skipped: 0,
      });
  });

  it("reads an empty calendar as recognized with no items", () => {
    expect(parseIcs(vcalendar())).toEqual({
      recognized: true,
      items: [],
      skipped: 0,
    });
  });

  it("skips events with no UID, no title, a too-long UID, or an impossible date", () => {
    const parse = parseIcs(
      vcalendar(
        ...vevent("SUMMARY:No UID", "DTSTART:20261001T120000Z"),
        ...vevent("UID:no-title", "DTSTART:20261001T120000Z"),
        ...vevent(
          `UID:${"x".repeat(201)}`,
          "SUMMARY:Long UID",
          "DTSTART:20261001T120000Z",
        ),
        ...vevent(
          "UID:feb-30",
          "SUMMARY:Feb 30",
          "DTSTART;VALUE=DATE:20270230",
        ),
        ...vevent("UID:hour-25", "SUMMARY:25h", "DTSTART:20261001T250000Z"),
        ...vevent("UID:ok", "SUMMARY:Fine", "DTSTART:20261001T120000Z"),
      ),
    );
    expect(parse.skipped).toBe(5);
    expect(parse.items.map((i) => i.uid)).toEqual(["ok"]);
  });

  it("ignores an END that doesn't match and lines that aren't content lines", () => {
    const parse = parseIcs(
      vcalendar(
        ...vevent(
          "UID:a",
          "not a content line",
          "END:VALARM",
          "SUMMARY:Still read",
          "DTSTART:20261001T120000Z",
        ),
      ),
    );
    expect(parse.items.map((i) => i.title)).toEqual(["Still read"]);
  });

  it("keeps a DTEND only when it's after DTSTART", () => {
    const parse = parseIcs(
      vcalendar(
        ...vevent(
          "UID:a",
          "SUMMARY:Backwards",
          "DTSTART:20261001T120000Z",
          "DTEND:20261001T110000Z",
        ),
      ),
    );
    expect(parse.items[0]?.endAt).toBeNull();
  });

  it("cuts a very long title to 300 characters", () => {
    const parse = parseIcs(
      vcalendar(
        ...vevent(
          "UID:a",
          `SUMMARY:${"Long ".repeat(100)}`,
          "DTSTART:20261001T120000Z",
        ),
      ),
    );
    expect(parse.items[0]?.title).toHaveLength(300);
  });

  it("reads the event's first occurrence when it repeats", () => {
    const parse = parseIcs(
      vcalendar(
        ...vevent(
          "UID:weekly",
          "SUMMARY:Recitation",
          "DTSTART;TZID=America/New_York:20260908T090000",
          "RRULE:FREQ=WEEKLY;COUNT=14",
        ),
      ),
    );
    expect(parse.items.map((i) => i.dueAt)).toEqual([
      "2026-09-08T13:00:00.000Z",
    ]);
  });
});

describe("robustness", () => {
  const LOGICAL = Object.entries(FEEDS).map(
    ([name, { text, source }]) => [name, unfoldLines(text), source] as const,
  );

  it.each(LOGICAL)(
    "%s: reads the same folded anywhere, with any line ends",
    (_, lines, source) => {
      const original = parseIcs(lines.join("\r\n"), source);
      fc.assert(
        fc.property(
          fc.infiniteStream(fc.nat({ max: 90 })),
          fc.infiniteStream(fc.constantFrom("\r\n", "\n", "\r")),
          fc.infiniteStream(fc.constantFrom(" ", "\t")),
          (widths, ends, leads) => {
            const width = widths[Symbol.iterator]();
            const end = ends[Symbol.iterator]();
            const lead = leads[Symbol.iterator]();
            const folded = lines
              .map((line) => {
                const parts: string[] = [];
                let rest = line;
                for (;;) {
                  const w = 1 + Number(width.next().value);
                  if (rest.length <= w) break;
                  parts.push(rest.slice(0, w));
                  rest = rest.slice(w);
                }
                parts.push(rest);
                return parts
                  .map((p, i) =>
                    i === 0 ? p : `${String(lead.next().value)}${p}`,
                  )
                  .join(String(end.next().value));
              })
              .join(String(end.next().value));
            expect(parseIcs(folded, source)).toEqual(original);
          },
        ),
        { numRuns: 40 },
      );
    },
  );

  it("never throws, and always answers in the schema", () => {
    const fragment = fc.constantFrom(
      "BEGIN:VCALENDAR",
      "END:VCALENDAR",
      "BEGIN:VEVENT",
      "END:VEVENT",
      "BEGIN:VALARM",
      "UID:a",
      "UID:b",
      "SUMMARY:Quiz [CMSC216-0101: X]",
      "DTSTART:20261001T120000Z",
      "DTSTART;VALUE=DATE:20261001",
      'DTSTART;TZID="Mars/Olympus":20261001T120000',
      "DTSTART;TZID=America/New_York:20270314T023000",
      "DTEND:20261001T130000Z",
      "URL:https://elms.umd.edu/x",
      "URL:not a url",
      "SEQUENCE:x",
      "STATUS:CANCELLED",
      " folded",
    );
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fragment, fc.string({ maxLength: 30 })), {
          maxLength: 40,
        }),
        fc.constantFrom("\r\n", "\n"),
        (lines, eol) => {
          const parse = parseIcs(lines.join(eol), "file");
          expect(IcsParseSchema.safeParse(parse).success).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("content lines", () => {
  it("unfolds a line split with a space or a tab", () => {
    expect(unfoldLines("SUMMARY:Pro\r\n ject\r\n\t 2\r\nUID:a")).toEqual([
      "SUMMARY:Project 2",
      "UID:a",
    ]);
  });

  it("reads parameters, quoted ones included", () => {
    expect(
      parseContentLine(
        'dtstart;tzid="America/New_York";X-A=a,"b:c":20261001T090000',
      ),
    ).toEqual({
      name: "DTSTART",
      params: { TZID: "America/New_York", "X-A": "a,b:c" },
      value: "20261001T090000",
    });
    expect(parseContentLine("URL;VALUE=URI:https://x.test/a:b")?.value).toBe(
      "https://x.test/a:b",
    );
  });

  it("rejects what isn't a content line", () => {
    for (const line of [
      "",
      ":value",
      "NAME",
      "NAME;PARAM:value",
      'N;P="open:v',
    ])
      expect(parseContentLine(line)).toBeNull();
  });

  it("unescapes text", () => {
    expect(unescapeText("a\\, b\\; c\\\\ d\\ne\\Nf")).toBe("a, b; c\\ d\ne\nf");
  });

  it("reads a leap second as :59", () => {
    const line = parseContentLine("DTSTART:20261231T235960Z");
    expect(line && readWhen(line)).toEqual({
      kind: "instant",
      ms: Date.UTC(2026, 11, 31, 23, 59, 59),
    });
  });
});
