import { describe, expect, it } from "vitest";
import { fourYearCourses } from "~/core/four-year/course-lookup";
import { unmetPrereqGroups } from "~/core/four-year/prereqs";
import { detectFourYearProblems } from "~/core/four-year/problems";
import { fourYearReducer } from "~/core/four-year/reducer";
import {
  checkTemplate,
  templateCredits,
  templateRef,
  templateSemesters,
} from "~/core/four-year/templates";
import { statusAround } from "~/core/four-year/test-helpers";
import {
  CourseIndexDeptSchema,
  CourseIndexManifestSchema,
} from "~/core/schema";
import { FourYearTemplateSchema } from "~/core/schema/four-year";
import { aFourYear, FIXTURE_NOW, mockDataSource } from "~/fixtures";
import { loadTemplates } from "./template-files";

// Every sample plan in ./templates (docs/V3.md §2.11), against the course
// index fixture: it validates, every code is one the index knows (or a
// valid placeholder), the credits add up, and the source is https. Added to
// an empty plan, a sample never orders its own courses wrong and has no
// light semester. A prerequisite from outside the sample can still show
// (MATH140's MATH115, which placement usually covers): that's Testudo's
// sentence, and the Problems tab says so as information.

const FILES = import.meta.glob<unknown>("./templates/*.json", {
  eager: true,
  import: "default",
});

/** The whole fixture index, every department loaded. */
async function fixtureLookup() {
  const manifest = CourseIndexManifestSchema.parse(
    await mockDataSource.json("courses/manifest.json"),
  );
  const depts = await Promise.all(
    manifest.departments.map(async (d) =>
      CourseIndexDeptSchema.parse(
        await mockDataSource.json(`courses/dept/${d.code}.${d.hash}.json`),
      ),
    ),
  );
  return fourYearCourses(
    depts.flatMap((d) => d.courses),
    manifest.departments.map((d) => d.code),
  );
}

const templates = Object.entries(FILES).map(([path, json]) => ({
  path,
  template: FourYearTemplateSchema.parse(json),
}));

describe("sample plans", () => {
  it("includes the Computer Science sample", () => {
    expect(templates.map((t) => t.template.id)).toContain("cmsc-2026");
  });

  it.each(templates)("$path is named for its id", ({ path, template }) => {
    expect(path).toBe(`./templates/${template.id}.json`);
  });

  it.each(templates)(
    "$path: codes known, credits add up, https source",
    async ({ template }) => {
      expect(new URL(template.sourceUrl).protocol).toBe("https:");
      expect(checkTemplate(template, await fixtureLookup())).toEqual([]);
      // Room for the rest of a 120-credit degree, never past it.
      expect(templateCredits(template)).toBeLessThanOrEqual(120);
    },
  );

  it.each(templates)(
    "$path: added to an empty plan, its own courses are in order",
    async ({ template }) => {
      const doc = aFourYear({ firstTermId: "202608", entries: [] });
      let n = 0;
      const [added] = fourYearReducer(
        { docs: [doc] },
        {
          type: "apply-template",
          docId: doc.id,
          template: templateRef(template),
          semesters: templateSemesters(template, () => `entry_s${++n}`),
          now: FIXTURE_NOW,
        },
      ).docs;
      if (!added) throw new Error("no doc");
      expect(added.entries).toHaveLength(
        template.semesters.reduce((k, s) => k + s.entries.length, 0),
      );
      const lookup = await fixtureLookup();
      const problems = detectFourYearProblems({
        doc: added,
        lookup,
        statusOf: statusAround("before"),
        latestTermId: null,
      });
      const own = new Set(
        added.entries.flatMap((e) => (e.kind === "course" ? [e.code] : [])),
      );
      const outOfOrder = added.entries.flatMap((e) =>
        e.kind === "course"
          ? unmetPrereqGroups(added, e, lookup)
              .filter((group) => group.some((code) => own.has(code)))
              .map((group) => `${e.code} before ${group.join(" or ")}`)
          : [],
      );
      expect(outOfOrder).toEqual([]);
      expect(
        problems.filter((p) => p.kind !== "prereq-order").map((p) => p.id),
      ).toEqual([]);
    },
  );

  it("loads every file lazily, validated and by name", async () => {
    const loaded = await loadTemplates();
    expect(loaded.map((t) => t.id)).toEqual(
      [...templates]
        .sort((a, b) => a.template.name.localeCompare(b.template.name))
        .map((t) => t.template.id),
    );
  });
});
