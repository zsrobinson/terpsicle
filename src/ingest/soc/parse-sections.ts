import { createHtmlStream, type HtmlStream, squash, type Tag } from "../html";

// `/soc/{term}/sections?courseIds=…` → raw section records. Selectors and the
// markup variants they cover are in RESEARCH.md §5.1.5. Normalizing into the
// published schema happens in normalize.ts.

/** One `div.class-days-container > div.row`. */
export interface RawMeetingRow {
  days: string | null;
  start: string | null;
  end: string | null;
  building: string | null;
  room: string | null;
  type: string | null;
  /** "Class time/details on ELMS": the async online row. */
  elms: boolean;
  /** "Contact department or instructor for details.": no meeting data at all. */
  message: string | null;
}

export interface RawSection {
  code: string;
  /** From the `delivery-*` class. */
  delivery: "f2f" | "blended" | "online" | null;
  instructors: string[];
  total: number | null;
  open: number | null;
  /** null when Testudo shows no waitlist count. */
  waitlist: number | null;
  /** null when Testudo shows no holdfile count. */
  holdfile: number | null;
  rows: RawMeetingRow[];
  texts: string[];
  /** Non-standard dates, verbatim ("March 1, 2027"). */
  startDate: string | null;
  endDate: string | null;
  /** Has the course-level footnote marker ("*"). */
  footnote: boolean;
}

export interface RawCourseSections {
  course: string;
  sections: RawSection[];
  /** The course-level footnote text that marked sections refer to. */
  footnote: string | null;
}

const DELIVERY = {
  "delivery-f2f": "f2f",
  "delivery-blended": "blended",
  "delivery-online": "online",
} as const;

function toCount(text: string): number | null {
  const n = squash(text);
  return /^-?\d+$/.test(n) ? Math.max(0, Number.parseInt(n, 10)) : null;
}

function emptyRow(): RawMeetingRow {
  return {
    days: null,
    start: null,
    end: null,
    building: null,
    room: null,
    type: null,
    elms: false,
    message: null,
  };
}

/**
 * A streaming parser: `write` chunks as they arrive; `onCourse` fires once per
 * `div.course-sections` as soon as it closes.
 */
export function createSectionsParser(
  onCourse: (course: RawCourseSections) => void,
): { write(chunk: string): void; end(): void } {
  let course: (RawCourseSections & { depth: number }) | null = null;
  let section: (RawSection & { depth: number }) | null = null;
  let daysDepth = -1;
  let row: RawMeetingRow | null = null;
  let waitlistDepth = -1;
  let pendingLabel: string | null = null;

  const text = (set: (value: string) => void) =>
    stream.capture((value) => set(squash(value)));

  const currentRow = (): RawMeetingRow => {
    if (!row) {
      row = emptyRow();
      section?.rows.push(row);
    }
    return row;
  };

  const openInSection = (tag: Tag, s: RawSection) => {
    const c = tag.classes;
    if (tag.name === "div" && c.has("class-days-container")) {
      daysDepth = tag.depth;
      return;
    }
    if (daysDepth >= 0 && tag.depth === daysDepth + 1 && c.has("row")) {
      row = emptyRow();
      s.rows.push(row);
      return;
    }
    if (c.has("section-id")) return text((v) => (s.code = v));
    if (c.has("section-instructor"))
      return text((v) => v && s.instructors.push(v));
    if (c.has("total-seats-count")) return text((v) => (s.total = toCount(v)));
    if (c.has("open-seats-count")) return text((v) => (s.open = toCount(v)));
    if (c.has("waitlist") && tag.name === "span") {
      waitlistDepth = tag.depth;
      pendingLabel = null;
      return;
    }
    if (waitlistDepth >= 0 && c.has("seats-info-label"))
      return text((v) => (pendingLabel = v));
    if (waitlistDepth >= 0 && c.has("waitlist-count")) {
      // Keyed by label: a section can show a Holdfile count and no Waitlist.
      const label = pendingLabel;
      pendingLabel = null;
      return text((v) => {
        const n = toCount(v);
        if (label?.toLowerCase().startsWith("holdfile")) s.holdfile = n;
        else if (
          label?.toLowerCase().startsWith("waitlist") ||
          s.waitlist === null
        )
          s.waitlist = n;
        else s.holdfile = n;
      });
    }
    if (c.has("section-start-date")) return text((v) => (s.startDate = v));
    if (c.has("section-end-date")) return text((v) => (s.endDate = v));
    if (c.has("section-text")) return text((v) => v && s.texts.push(v));
    if (c.has("footnote-marker")) {
      s.footnote = true;
      return;
    }
    if (daysDepth < 0) return;
    // Meeting-row fields.
    if (c.has("section-days"))
      return text((v) => (currentRow().days = v || null));
    if (c.has("class-start-time"))
      return text((v) => (currentRow().start = v || null));
    if (c.has("class-end-time"))
      return text((v) => (currentRow().end = v || null));
    if (c.has("building-code"))
      return text((v) => (currentRow().building = v || null));
    if (c.has("class-room"))
      return text((v) => (currentRow().room = v || null));
    if (c.has("class-type"))
      return text((v) => (currentRow().type = v || null));
    if (c.has("elms-class-message")) {
      currentRow().elms = true;
      return;
    }
    if (c.has("class-message"))
      return text((v) => (currentRow().message = v || null));
  };

  const finishSection = () => {
    if (!section) return;
    const { depth: _, ...done } = section;
    course?.sections.push(done);
    section = null;
    daysDepth = -1;
    row = null;
    waitlistDepth = -1;
  };
  // Testudo's markup isn't always balanced (a section note ending in
  // `</A</div>` swallows a close tag), so a new course or section also ends
  // the previous one instead of trusting depths alone.
  const finishCourse = () => {
    finishSection();
    if (!course) return;
    const { depth: _, ...done } = course;
    course = null;
    onCourse(done);
  };

  const stream: HtmlStream = createHtmlStream({
    open(tag) {
      const c = tag.classes;
      if (tag.name === "div" && c.has("course-sections")) {
        finishCourse();
        course = {
          course: tag.attrs.id ?? "",
          sections: [],
          footnote: null,
          depth: tag.depth,
        };
        return;
      }
      if (!course) return;
      if (tag.name === "div" && c.has("section")) {
        finishSection();
        let delivery: RawSection["delivery"] = null;
        for (const [cls, value] of Object.entries(DELIVERY)) {
          if (c.has(cls)) delivery = value;
        }
        section = {
          code: "",
          delivery,
          instructors: [],
          total: null,
          open: null,
          waitlist: null,
          holdfile: null,
          rows: [],
          texts: [],
          startDate: null,
          endDate: null,
          footnote: false,
          depth: tag.depth,
        };
        return;
      }
      if (section) return openInSection(tag, section);
      if (c.has("footnote-message")) {
        const target = course;
        text((v) => {
          if (v) target.footnote = v;
        });
      }
    },
    close(tag) {
      if (section) {
        if (tag.depth === daysDepth) {
          daysDepth = -1;
          row = null;
        } else if (daysDepth >= 0 && tag.depth === daysDepth + 1) {
          row = null;
        }
        if (tag.depth === waitlistDepth) waitlistDepth = -1;
        if (tag.depth <= section.depth) finishSection();
        if (course && tag.depth <= course.depth) finishCourse();
        return;
      }
      if (course && tag.depth <= course.depth) finishCourse();
    },
  });

  return {
    write: (chunk) => stream.write(chunk),
    end: () => {
      stream.end();
      finishCourse();
    },
  };
}

/** Parses a whole sections page (tests, small inputs). */
export function parseSectionsPage(html: string): RawCourseSections[] {
  const out: RawCourseSections[] = [];
  const parser = createSectionsParser((c) => out.push(c));
  parser.write(html);
  parser.end();
  return out;
}
