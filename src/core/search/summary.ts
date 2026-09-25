import { countFittingSections, type FitContext, fitLabel } from "../fit/fit";
import type { Course, FitLabel, Section } from "../schema";
import { formatDays, formatTimeRange } from "../time/format";

// What a search result says about its sections, by how many there are
// (DESIGN §5: design for 1, a few and many). One section is "the class", so
// the row says when it meets and whether it fits; several say how many fit.

export type ResultSummary =
  | { readonly kind: "none" }
  | {
      readonly kind: "one";
      /** "TuTh 12:30pm–1:45pm", "MWF 10am–10:50am · Tu 2pm–2:50pm", "Online, no set times". */
      readonly when: string;
      /** null with no plan to fit against. */
      readonly fit: FitLabel | null;
    }
  | {
      readonly kind: "some";
      readonly sections: number;
      /** How many fit the plan; null with no plan to fit against. */
      readonly fit: number | null;
    };

export function resultSummary(
  course: Course,
  fit: FitContext | null,
): ResultSummary {
  const [only, ...rest] = course.sections;
  if (!only) return { kind: "none" };
  if (rest.length === 0)
    return {
      kind: "one",
      when: sectionWhen(only),
      fit: fit ? fitLabel(fit, course, only) : null,
    };
  return {
    kind: "some",
    sections: course.sections.length,
    fit: fit ? countFittingSections(fit, course) : null,
  };
}

/** Days and times, no rooms: the part that decides whether it fits. */
export function sectionWhen(section: Section): string {
  const timed = section.meetings.flatMap((m) =>
    m.timed ? [`${formatDays(m.days)} ${formatTimeRange(m.start, m.end)}`] : [],
  );
  if (timed.length > 0) return [...new Set(timed)].join(" · ");
  if (section.meetings.length === 0) return "Contact the department for times";
  return section.delivery === "online-async" ||
    section.delivery === "online-sync"
    ? "Online, no set times"
    : "Times TBA";
}

/**
 * The fit words for a one-section result, or null when the meeting line
 * already says it ("In plan" shows on the row; untimed says "no set times").
 */
export function resultFitWords(label: FitLabel): string | null {
  switch (label.kind) {
    case "fits":
      return "Fits";
    case "overlaps":
      return `Overlaps ${label.with.kind === "course" ? label.with.courseCode : label.with.label}`;
    case "not-enough-time":
      return `Not enough time ${label.direction} ${label.courseCode}`;
    case "in-plan":
    case "no-set-times":
      return null;
  }
}

/** "4 sections · 2 fit", "92 sections · none fit", "3 sections". */
export function sectionCountWords(
  sections: number,
  fit: number | null,
): string {
  const count = `${sections} section${sections === 1 ? "" : "s"}`;
  if (fit === null) return count;
  return `${count} · ${fit === 0 ? "none" : fit} fit`;
}
