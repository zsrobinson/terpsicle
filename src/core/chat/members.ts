import { mainPlanFor } from "../plans/main-plan";
import type {
  CourseCode,
  MainPlans,
  Plan,
  SectionCode,
  TermId,
} from "../schema";

// Who's in a course's rooms, from people's synced plans (V2.md §8.2). Your
// rooms in a term come from its main plan (~/core/plans/main-plan: the
// settings doc's `mainPlans` choice, or else the first tab); `chat_members`
// in D1 holds one row per course of it, rewritten on every sync push.

/** A `chat_members` row without its user: a course of a main plan. */
export type ChatMember = {
  readonly termId: TermId;
  readonly courseCode: CourseCode;
  /** The placed section; "" for a course saved for later (its course room only). */
  readonly sectionCode: SectionCode | "";
};

/** One row per course of the term's main plan, in plan order. */
export function chatMembersFor(
  termId: TermId,
  plans: readonly Plan[],
  mainPlans: Readonly<MainPlans>,
): ChatMember[] {
  const plan = mainPlanFor(termId, plans, mainPlans);
  return (plan?.courses ?? []).map((c) => ({
    termId,
    courseCode: c.courseCode,
    sectionCode: c.sectionCode ?? "",
  }));
}

/**
 * Every section of `courseCode` placed in any of your plans for the term,
 * sorted. Professor and section rooms are open to you with one of their
 * sections in any plan, not just the main plan (V2 §8.2): it's on trust.
 */
export function sectionsInPlans(
  termId: TermId,
  courseCode: CourseCode,
  plans: readonly Plan[],
): SectionCode[] {
  const codes = new Set<SectionCode>();
  for (const plan of plans) {
    if (plan.termId !== termId) continue;
    for (const c of plan.courses)
      if (c.courseCode === courseCode && c.sectionCode !== null)
        codes.add(c.sectionCode);
  }
  return [...codes].sort();
}
