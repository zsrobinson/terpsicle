import { beforeEach, describe, expect, it } from "vitest";
import {
  archivedFixtureTermId,
  aSharePayload,
  CANCELLED_SECTION_KEY,
  mockSection,
} from "~/fixtures";
import { plansInTerm } from "./plan-ops";
import { encodeSharePayload } from "./share-codec";
import { saveSharedCopy, useShare } from "./share-store";
import { loadStores } from "./testing";
import { useUi } from "./ui-store";
import { useWorkspace } from "./workspace-store";

// A plan in the archived term, so it's not the term the person would see.
const TERM = archivedFixtureTermId;
const KEY = "CMSC131-0101";

describe("shared links", () => {
  beforeEach(loadStores);

  it("opens a shared plan without touching the person's data", async () => {
    const param = await encodeSharePayload(
      aSharePayload({ termId: TERM, sections: [KEY] }),
    );
    const before = useWorkspace.getState();
    const result = await useShare.getState().open(param);
    expect(result.ok).toBe(true);
    expect(useShare.getState().shared).toMatchObject({ status: "ready" });
    expect(useWorkspace.getState().plans).toBe(before.plans);
    expect(useUi.getState().lastTermId).toBeNull();
  });

  it("Save a copy makes a plan in the link's term with fresh snapshots, dropping missing sections", async () => {
    const payload = aSharePayload({
      termId: TERM,
      name: "Alex's week",
      sections: [KEY, CANCELLED_SECTION_KEY],
      saved: ["CMSC330"],
    });
    await useShare.getState().open(await encodeSharePayload(payload));
    const copy = await saveSharedCopy(payload);

    expect(copy.dropped).toEqual([CANCELLED_SECTION_KEY]);
    const plans = plansInTerm(useWorkspace.getState().plans, TERM);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      id: copy.planId,
      name: "Alex's week",
      courses: [
        {
          courseCode: "CMSC131",
          sectionCode: "0101",
          snapshot: {
            instructors: mockSection(KEY, TERM).instructors,
          },
        },
        { courseCode: "CMSC330", sectionCode: null, snapshot: null },
      ],
    });
    expect(useWorkspace.getState().activePlanByTerm[TERM]).toBe(copy.planId);
    expect(useUi.getState().lastTermId).toBe(TERM);
    expect(useShare.getState().shared).toBeNull();
    // Undoable like any other change.
    useWorkspace.getState().undo();
    expect(plansInTerm(useWorkspace.getState().plans, TERM)).toHaveLength(0);
  });
});
