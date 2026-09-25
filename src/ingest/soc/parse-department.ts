import { createHtmlStream, type HtmlStream, squash } from "../html";

// `/soc/{term}/{DEPT}` → raw course records (RESEARCH.md §5.1.4). Sections
// come from the sections endpoint instead (parse-sections.ts).

/** Separates a <strong> label from its text inside a course-text capture. */
export const LABEL_START = "\u0001";
export const LABEL_END = "\u0002";
/** Stands for <br> inside free-text course notes. */
export const LINE_BREAK = "\u0003";

export interface RawGenEd {
  code: string;
  /** "(if taken with GEOL110)", or null. */
  condition: string | null;
  /** Text between the previous code and this one: "," (and) or "or". */
  separator: string;
}

export interface RawCourse {
  code: string;
  title: string;
  minCredits: string | null;
  maxCredits: string | null;
  grading: string[];
  genEds: RawGenEd[];
  permission: string | null;
  /** Each `approved-course-text` block, with LABEL_START/LABEL_END around <strong> labels. */
  approvedTexts: string[];
  /** Each `course-text` block, with LINE_BREAK for <br> and label markers. */
  courseTexts: string[];
  /** "Contact department for information to register for this course." */
  individualInstruction: boolean;
}

export interface RawDepartmentPage {
  /** "Computer Science"; null if the page had no prefix header (unknown dept). */
  deptName: string | null;
  /** "09/24/2026 at 10:30 PM", verbatim; null when Testudo doesn't show it. */
  seatsAsOf: string | null;
  courses: RawCourse[];
}

export function createDepartmentParser(): {
  write(chunk: string): void;
  end(): RawDepartmentPage;
} {
  const page: RawDepartmentPage = {
    deptName: null,
    seatsAsOf: null,
    courses: [],
  };
  let course: (RawCourse & { depth: number }) | null = null;
  let textDepth = -1; // inside approved-course-text / course-text
  let genEdDepth = -1;
  let genEdSeparator = "";
  let subcategory: RawGenEd | null = null;
  let subcategoryDepth = -1;
  let inCode = false;

  const text = (set: (value: string) => void) =>
    stream.capture((value) => set(squash(value)));

  const stream: HtmlStream = createHtmlStream({
    open(tag) {
      const c = tag.classes;
      if (c.has("course-prefix-name")) {
        text((v) => (page.deptName = v || null));
        return;
      }
      if (tag.attrs.id === "seats-update-time") {
        text((v) => {
          const m = /as of\s+(.+)$/i.exec(v);
          page.seatsAsOf = m?.[1] ? squash(m[1]) : null;
        });
        return;
      }
      if (tag.name === "div" && c.has("course") && tag.attrs.id) {
        // Don't trust depths alone: unbalanced markup must not merge courses.
        finishCourse();
        course = {
          code: tag.attrs.id,
          title: "",
          minCredits: null,
          maxCredits: null,
          grading: [],
          genEds: [],
          permission: null,
          approvedTexts: [],
          courseTexts: [],
          individualInstruction: false,
          depth: tag.depth,
        };
        return;
      }
      const cur = course;
      if (!cur) return;

      if (textDepth >= 0) {
        if (tag.name === "strong") stream.mark(LABEL_START);
        else if (tag.name === "br") stream.mark(LINE_BREAK);
        return;
      }
      if (c.has("approved-course-text")) {
        textDepth = tag.depth;
        stream.capture((v) => {
          const t = v.trim();
          if (t) cur.approvedTexts.push(t);
        });
        return;
      }
      if (c.has("course-text")) {
        textDepth = tag.depth;
        stream.capture((v) => {
          const t = v.trim();
          if (t) cur.courseTexts.push(t);
        });
        return;
      }
      if (c.has("course-title")) return text((v) => (cur.title = v));
      if (c.has("course-min-credits"))
        return text((v) => (cur.minCredits = v || null));
      if (c.has("course-max-credits"))
        return text((v) => (cur.maxCredits = v || null));
      if (tag.name === "abbr" && stackHas(stream, "grading-method"))
        return text((v) => v && cur.grading.push(v));
      if (c.has("perm-req-message"))
        return text(
          (v) => (cur.permission = v.replace(/^\(|\)$/g, "") || null),
        );
      if (c.has("individual-instruction-message")) {
        cur.individualInstruction = true;
        return;
      }
      if (c.has("gen-ed-codes-group")) {
        genEdDepth = tag.depth;
        genEdSeparator = "";
        return;
      }
      if (genEdDepth >= 0 && c.has("course-subcategory")) {
        subcategory = {
          code: "",
          condition: null,
          separator: squash(genEdSeparator),
        };
        subcategoryDepth = tag.depth;
        genEdSeparator = "";
        return;
      }
      if (subcategory && tag.name === "a") inCode = true;
    },
    text(t) {
      if (subcategory) {
        if (inCode) subcategory.code += t;
        else subcategory.condition = (subcategory.condition ?? "") + t;
      } else if (genEdDepth >= 0) {
        genEdSeparator += t;
      }
    },
    close(tag) {
      if (textDepth >= 0) {
        if (tag.name === "strong") stream.mark(LABEL_END);
        if (tag.depth <= textDepth) textDepth = -1;
        return;
      }
      if (subcategory && tag.name === "a") inCode = false;
      if (subcategory && tag.depth === subcategoryDepth) {
        const cond = squash(subcategory.condition ?? "");
        course?.genEds.push({
          code: squash(subcategory.code),
          condition: cond || null,
          separator: subcategory.separator,
        });
        subcategory = null;
        subcategoryDepth = -1;
      }
      if (tag.depth <= genEdDepth) genEdDepth = -1;
      if (course && tag.depth <= course.depth) finishCourse();
    },
  });

  function finishCourse() {
    if (!course) return;
    const { depth: _, ...done } = course;
    page.courses.push(done);
    course = null;
    textDepth = -1;
    genEdDepth = -1;
    subcategory = null;
  }

  return {
    write: (chunk) => stream.write(chunk),
    end() {
      stream.end();
      finishCourse();
      return page;
    },
  };
}

function stackHas(stream: HtmlStream, cls: string): boolean {
  return stream.stack.some((t) => t.classes.has(cls));
}

export function parseDepartmentPage(html: string): RawDepartmentPage {
  const parser = createDepartmentParser();
  parser.write(html);
  return parser.end();
}
