import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { aPlan } from "~/fixtures";
import { TerpsicleDb } from "~/state/db";
import { readPlanCourses, readPlans } from "./your-classes";

// Reviews reads the scheduler's database raw (no Dexie on /reviews): the
// plans, for "Courses in your plans".

const opened: TerpsicleDb[] = [];

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await db.delete();
  }
});

async function saved(name: string) {
  const db = new TerpsicleDb(name);
  opened.push(db);
  await db.plans.bulkPut([
    aPlan({ id: "plan_main_a", termId: "202601" }),
    aPlan({ id: "plan_main_b", termId: "202601", order: 1 }),
  ]);
  db.close();
}

describe("the scheduler's plans, read raw", () => {
  it("reads the plans and their courses", async () => {
    await saved("reviews-raw-1");
    expect((await readPlans("reviews-raw-1")).map((p) => p.id).sort()).toEqual([
      "plan_main_a",
      "plan_main_b",
    ]);
    expect(await readPlanCourses("reviews-raw-1")).toEqual(["CMSC351"]);
  });

  it("reads nothing, and makes no database, where there's none", async () => {
    expect(await readPlans("reviews-raw-none")).toEqual([]);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain("reviews-raw-none");
  });
});
