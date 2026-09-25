import {
  type Connection,
  type CourseCode,
  parseSectionKey,
  type Section,
  type SectionKey,
  sectionKey,
} from "../schema";
import { detectProblems, type ProblemsInput } from "./detect";
import { planWithSection } from "./problems";

// "Sections that fix this" in connection details (SPEC §3.7): every switch
// that fixes one connection, where Problems offers only the best one.

export type ConnectionFix = {
  readonly courseCode: CourseCode;
  readonly section: Section;
  readonly key: SectionKey;
};

/**
 * Sections of either course in a tight or not-enough-time connection that
 * fix it: after the switch, that course pair is no longer tight or short, and
 * the plan has no problem it didn't have before (the same rule as a
 * problem's one-click fix). The later class's course comes first, since
 * changing it is the more direct fix; then section order. Empty for any
 * other verdict.
 */
export function connectionFixes(
  input: ProblemsInput,
  connection: Connection,
): ConnectionFix[] {
  if (connection.verdict !== "tight" && connection.verdict !== "insufficient")
    return [];
  const from = parseSectionKey(connection.from.sectionKey);
  const to = parseSectionKey(connection.to.sectionKey);
  if (!from || !to) return [];
  const pair = `${from.courseCode}>${to.courseCode}`;
  const travelSignatures = [
    `not-enough-time:${pair}`,
    `tight-connection:${pair}`,
  ];
  const before = new Set(detectProblems(input).map((d) => d.signature));
  const courses =
    from.courseCode === to.courseCode
      ? [to.courseCode]
      : [to.courseCode, from.courseCode];

  const fixes: ConnectionFix[] = [];
  for (const courseCode of courses) {
    const placed = input.plan.courses.find((c) => c.courseCode === courseCode);
    const course = input.index.courses.get(courseCode);
    if (!placed || !course) continue;
    for (const section of course.sections) {
      if (section.code === placed.sectionCode) continue;
      const after = detectProblems({
        ...input,
        plan: planWithSection(input.plan, courseCode, section),
      }).map((d) => d.signature);
      const fixed = !after.some((s) => travelSignatures.includes(s));
      if (fixed && after.every((s) => before.has(s)))
        fixes.push({
          courseCode,
          section,
          key: sectionKey(courseCode, section.code),
        });
    }
  }
  return fixes;
}
