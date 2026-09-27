import type { CourseCode, LocalId, Plan, TermId, Wildcard } from "../schema";
import type {
  FourYearCourseEntry,
  FourYearCreditEntry,
  FourYearDoc,
  FourYearTerm,
  FourYearTermStatus,
  FourYearWildcardEntry,
} from "../schema/four-year";

// "View schedule" (docs/V3.md §2.12): one scheduler plan per term is the
// four-year plan's link, never a copy of it. Plan shows the link on the next
// semester's column; the scheduler makes or opens the plan, and its Courses
// tab names what the column has that the plan doesn't.

/** The term's active plan on this device, else its first tab; null when the term has none. */
export function linkedSchedulePlan(
  termId: TermId,
  plans: readonly Plan[],
  activePlanByTerm: Readonly<Partial<Record<TermId, LocalId>>>,
): Plan | null {
  const inTerm = plans.filter((p) => p.termId === termId);
  const active = activePlanByTerm[termId];
  const chosen = inTerm.find((p) => p.id === active);
  if (chosen) return chosen;
  let first: Plan | null = null;
  for (const p of inTerm)
    if (first === null || p.order < first.order) first = p;
  return first;
}

/** The column that gets "View schedule": the first one still planned. */
export function handoffTerm(
  columns: readonly FourYearTerm[],
  statusOf: (term: FourYearTerm) => FourYearTermStatus,
): TermId | null {
  for (const term of columns)
    if (term !== "before" && statusOf(term) === "planned") return term;
  return null;
}

/** What the handoff reads of an entry: the scheduler parses no more than this. */
export type HandoffEntry =
  | Pick<FourYearCourseEntry, "kind" | "term" | "code">
  | Pick<FourYearWildcardEntry, "kind" | "term" | "wildcard">
  | Pick<FourYearCreditEntry, "kind" | "term">;

/** What a column hands the scheduler: its courses, and the placeholders it can't. */
export function handoffCourses(entries: readonly HandoffEntry[]): {
  readonly courses: CourseCode[];
  readonly placeholders: Wildcard[];
} {
  const courses: CourseCode[] = [];
  const placeholders: Wildcard[] = [];
  for (const e of entries)
    if (e.kind === "course" && !courses.includes(e.code)) courses.push(e.code);
    else if (e.kind === "wildcard") placeholders.push(e.wildcard);
  return { courses, placeholders };
}

/** A term's column of a doc (or of none), as the scheduler takes it. */
export function fourYearColumnFor(
  doc: { readonly entries: readonly HandoffEntry[] } | null,
  termId: TermId,
): ReturnType<typeof handoffCourses> {
  return handoffCourses(doc?.entries.filter((e) => e.term === termId) ?? []);
}

/** The four-year plan open in Plan, else the oldest; the scheduler reads the same one. */
export function pickFourYearDoc<
  D extends Pick<FourYearDoc, "id" | "createdAt">,
>(docs: readonly D[], activeId: LocalId | null): D | null {
  const open = docs.find((d) => d.id === activeId);
  if (open) return open;
  let oldest: D | null = null;
  for (const d of docs)
    if (oldest === null || d.createdAt < oldest.createdAt) oldest = d;
  return oldest;
}

/** What arriving from Plan does to the term's plans. */
export type PlanHandoff =
  /** The term has no plan: make "Plan A" with the courses bookmarked. */
  | { readonly kind: "create" }
  /** The term's only plan is empty (a visit made it): bookmark the courses there. */
  | { readonly kind: "fill"; readonly plan: Plan }
  /** Open the linked plan as it is. */
  | { readonly kind: "open"; readonly plan: Plan }
  /** No plan and nothing to hand over: the scheduler's usual first visit. */
  | { readonly kind: "none" };

export function planHandoff(
  termId: TermId,
  plans: readonly Plan[],
  activePlanByTerm: Readonly<Partial<Record<TermId, LocalId>>>,
  courses: readonly CourseCode[],
): PlanHandoff {
  const linked = linkedSchedulePlan(termId, plans, activePlanByTerm);
  if (!linked)
    return courses.length > 0 ? { kind: "create" } : { kind: "none" };
  const alone = plans.filter((p) => p.termId === termId).length === 1;
  if (alone && linked.courses.length === 0 && courses.length > 0)
    return { kind: "fill", plan: linked };
  return { kind: "open", plan: linked };
}

/** The column's courses the plan has neither placed nor bookmarked. */
export function missingFromPlan(
  courses: readonly CourseCode[],
  plan: Pick<Plan, "courses">,
): CourseCode[] {
  const there = new Set(plan.courses.map((c) => c.courseCode));
  return courses.filter((c) => !there.has(c));
}

/** "From Plan A: 4 of 5 placed": how many of the column's courses have a section in the plan. */
export function placedInPlan(
  courses: readonly CourseCode[],
  plan: Pick<Plan, "courses">,
): { readonly placed: number; readonly total: number } {
  const placed = new Set(
    plan.courses.filter((c) => c.sectionCode !== null).map((c) => c.courseCode),
  );
  return {
    placed: courses.filter((c) => placed.has(c)).length,
    total: courses.length,
  };
}

/** "A", "A and B", "A, B and C". */
function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "an" before a letter said with a vowel sound: "an FSAW course", "a DSHS course". */
function article(code: string): string {
  return "AEFHILMNORSX".includes(code.charAt(0)) ? "an" : "a";
}

/** A placeholder in a sentence: its pattern ("CMSC4XX"), or "a DSHS course". */
function placeholderName(wildcard: Wildcard): string {
  return wildcard.kind === "pattern"
    ? wildcard.pattern
    : `${article(wildcard.code)} ${wildcard.code} course`;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The toast when the scheduler bookmarks the column's courses in a plan. */
export function handoffToast(planName: string, count: number): string {
  return count === 1
    ? `${planName} has your course from your four-year plan. Pick a section for it.`
    : `${planName} has your ${count} courses from your four-year plan. Pick sections for each.`;
}

/** The Courses tab's line while the plan lacks some of the column's courses. */
export function missingLine(missing: readonly CourseCode[]): string {
  const verb = missing.length === 1 ? "isn't" : "aren't";
  return `From your four-year plan: ${listWords(missing)} ${verb} here.`;
}

/** The Courses tab's line for the column's placeholders, which can't be bookmarked. */
export function placeholderLine(placeholders: readonly Wildcard[]): string {
  const names = [...new Set(placeholders.map(placeholderName))];
  return capitalized(
    names.length === 1
      ? `${names[0]} is a placeholder; pick a course in Search or Generate.`
      : `${listWords(names)} are placeholders; pick courses in Search or Generate.`,
  );
}

/** The Undo toast for "Add them". */
export function addedLine(added: readonly CourseCode[]): string {
  return `Added ${listWords(added)} from your four-year plan`;
}

/** Plan's count on the next semester's column. */
export function placedLine(
  planName: string,
  { placed, total }: { readonly placed: number; readonly total: number },
): string {
  return `From ${planName}: ${placed} of ${total} placed`;
}
