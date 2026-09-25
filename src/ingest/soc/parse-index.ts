import { createHtmlStream, parseHtml, squash } from "../html";

// The small SOC pages: the term dropdown (`/soc/`) and a term's department
// list (`/soc/{term}`).

export interface RawTerm {
  id: string;
  /** Testudo's label: "Spring 2027". */
  name: string;
  /** Testudo's default selection (its newest term). */
  selected: boolean;
}

export function parseTermDropdown(html: string): RawTerm[] {
  const terms: RawTerm[] = [];
  let inSelect = -1;
  const stream = createHtmlStream({
    open(tag) {
      if (tag.name === "select" && tag.attrs.id === "term-id-input") {
        inSelect = tag.depth;
        return;
      }
      if (inSelect >= 0 && tag.name === "option") {
        const id = tag.attrs.value ?? "";
        const selected = "selected" in tag.attrs;
        stream.capture((text) =>
          terms.push({ id, name: squash(text), selected }),
        );
      }
    },
    close(tag) {
      if (tag.depth === inSelect) inSelect = -1;
    },
  });
  parseHtml(html, stream);
  return terms;
}

export interface RawDepartment {
  code: string;
  name: string;
}

export function parseDepartmentList(html: string): RawDepartment[] {
  const departments: RawDepartment[] = [];
  let current: RawDepartment | null = null;
  const stream = createHtmlStream({
    open(tag) {
      if (tag.classes.has("course-prefix") && tag.name === "div") {
        current = { code: "", name: "" };
        const target = current;
        stream.capture(() => {
          if (target.code) departments.push(target);
        });
        return;
      }
      const target = current;
      if (!target) return;
      if (tag.classes.has("prefix-abbrev"))
        stream.capture((text) => (target.code = squash(text)));
      else if (tag.classes.has("prefix-name"))
        stream.capture((text) => (target.name = squash(text)));
    },
  });
  parseHtml(html, stream);
  return departments;
}
