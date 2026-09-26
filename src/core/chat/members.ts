import type {
  ChatPlans,
  CourseCode,
  Plan,
  SectionCode,
  TermId,
} from "../schema";

// Who's in a course's rooms, from people's synced plans (V2.md §8.2). Per
// term, one plan is your chat plan: the settings doc's `chatPlans` choice,
// or else the term's first tab. Its courses are your rooms; `chat_members`
// in D1 holds one row per course of it, rewritten on every sync push.

/** A `chat_members` row without its user: a course of a chat plan. */
export type ChatMember = {
  readonly termId: TermId;
  readonly courseCode: CourseCode;
  /** The placed section; "" for a course saved for later (its course room only). */
  readonly sectionCode: SectionCode | "";
};

/** Tab order, the way the scheduler shows a term's plans. */
function byTab(a: Plan, b: Plan): number {
  return (
    a.order - b.order ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * The plan whose sections are your rooms in `termId`: the one `chatPlans`
 * names when it's still one of the term's plans, otherwise the first tab.
 * Null when you have no plan in the term.
 */
export function chatPlanFor(
  termId: TermId,
  plans: readonly Plan[],
  chatPlans: ChatPlans,
): Plan | null {
  const inTerm = plans.filter((p) => p.termId === termId);
  const chosen = chatPlans[termId];
  const named = chosen ? inTerm.find((p) => p.id === chosen) : undefined;
  return named ?? [...inTerm].sort(byTab)[0] ?? null;
}

/** One row per course of the term's chat plan, in plan order. */
export function chatMembersFor(
  termId: TermId,
  plans: readonly Plan[],
  chatPlans: ChatPlans,
): ChatMember[] {
  const plan = chatPlanFor(termId, plans, chatPlans);
  return (plan?.courses ?? []).map((c) => ({
    termId,
    courseCode: c.courseCode,
    sectionCode: c.sectionCode ?? "",
  }));
}

/**
 * Every section of `courseCode` placed in any of your plans for the term,
 * sorted. Professor and section rooms are open to you with one of their
 * sections in any plan, not just the chat plan (V2 §8.2): it's on trust.
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
