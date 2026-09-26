// The eval set's promises about the rules, checked in CI without a model.
// The live run is scripts/moderation-eval.ts.
import { describe, expect, it } from "vitest";
import { decide, precheck } from "~/core/moderation";
import { CourseCodeSchema } from "~/core/schema";
import { EVAL_CASES } from "./cases";

describe("moderation eval set", () => {
  it("has unique ids and valid courses", () => {
    const ids = EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of EVAL_CASES)
      if (c.course) expect(CourseCodeSchema.parse(c.course)).toBe(c.course);
  });

  it.each(EVAL_CASES.map((c) => [c.id, c] as const))(
    "%s: the rules never overreach",
    (_, c) => {
      const byRules = decide(
        precheck({
          kind: c.kind,
          text: c.text,
          context: { activeAssignments: c.activeAssignments ?? false },
        }),
      );
      if (c.rules) expect(byRules).toBe(c.rules);
      // Whatever the rules decide must be acceptable for the case: they may
      // leave a problem to the models, but never hold or remove good text.
      const acceptable = [c.expect, ...(c.accept ?? [])];
      if (byRules !== "publish") expect(acceptable).toContain(byRules);
    },
  );
});
