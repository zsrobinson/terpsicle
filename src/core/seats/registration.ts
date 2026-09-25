import type { SectionRef } from "../catalog/catalog-index";
import { type FitContext, sectionFits } from "../fit/fit";
import { type Course, type Section, sectionKey } from "../schema";
import { type SeatsMap, seatCounts } from "./seats";

// Export's registration checklist (SPEC §3.10).

/**
 * The order to register in: the section most likely to fill goes first. Full
 * sections lead (their waitlist position is first-come), then fewest open
 * seats, then smallest share open; sections with unknown seats go last. Ties
 * keep plan order.
 */
export function registrationOrder(
  sections: readonly SectionRef[],
  seats: SeatsMap | null,
): SectionRef[] {
  const risk = (ref: SectionRef): [number, number, number] => {
    const c = seatCounts(seats, ref.key);
    if (c === null) return [1, 0, 0];
    return [0, c.open, c.total > 0 ? c.open / c.total : 0];
  };
  return sections
    .map((ref, i) => ({ ref, i, r: risk(ref) }))
    .sort(
      (a, b) =>
        a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2] || a.i - b.i,
    )
    .map((x) => x.ref);
}

/**
 * Another section of the same course that also fits the plan, to register
 * for if the first choice fills. Prefers the most open seats, then unknown
 * counts over full sections, then section order; null when none fits.
 */
export function backupSection(
  ctx: FitContext,
  course: Course,
  current: Section,
  seats: SeatsMap | null,
): Section | null {
  let best: { section: Section; open: number } | null = null;
  for (const section of course.sections) {
    if (section.code === current.code || !sectionFits(ctx, course, section))
      continue;
    // Unknown counts rank between full (0) and one open seat (1).
    const open =
      seatCounts(seats, sectionKey(course.code, section.code))?.open ?? 0.5;
    if (best === null || open > best.open) best = { section, open };
  }
  return best?.section ?? null;
}
