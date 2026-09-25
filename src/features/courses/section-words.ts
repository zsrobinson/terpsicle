import type { Section, SectionSnapshot } from "~/core/schema";
import { formatDays } from "~/core/time";

// How a section reads in a list row: "A. Rivera · TuTh + W".

/** "TuTh + W" (distinct day sets in meeting order), "Online", or "No set times". */
export function meetingDaysLabel(
  section: Pick<Section | SectionSnapshot, "meetings" | "delivery">,
): string {
  const sets: string[] = [];
  for (const m of section.meetings) {
    if (!m.timed) continue;
    const days = formatDays(m.days);
    if (!sets.includes(days)) sets.push(days);
  }
  if (sets.length > 0) return sets.join(" + ");
  return section.delivery === "online-async" ? "Online" : "No set times";
}

/** "A. Rivera, B. Chen", or "Instructor TBA". */
export function instructorsLabel(
  section: Pick<Section | SectionSnapshot, "instructors">,
): string {
  return section.instructors.length > 0
    ? section.instructors.join(", ")
    : "Instructor TBA";
}

/** Both, as the Courses row's third line. */
export function sectionLine(
  section: Pick<
    Section | SectionSnapshot,
    "meetings" | "delivery" | "instructors"
  >,
): string {
  return `${instructorsLabel(section)} · ${meetingDaysLabel(section)}`;
}
