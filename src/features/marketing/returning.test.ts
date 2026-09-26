import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { RETURNING_FLAG_KEY } from "~/core/routing";
import { aPlan } from "~/fixtures";
import { TerpsicleDb } from "~/state/db";
import {
  markReturning,
  readPlanCount,
  returningCheckScript,
  skipMarketingInBrowser,
} from "./returning";

let dbCount = 0;

const planCount = (name: string) =>
  new Promise<number>((resolve) => readPlanCount(name, resolve));

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).flatMap((d) => (d.name ? [d.name] : []));
}

afterEach(() => {
  window.localStorage.clear();
});

describe("readPlanCount", () => {
  it("answers 0 without creating a database when there isn't one", async () => {
    const name = `returning-${++dbCount}`;
    expect(await planCount(name)).toBe(0);
    expect(await databaseNames()).not.toContain(name);
  });

  it("counts the app's saved plans, and leaves the database usable", async () => {
    const name = `returning-${++dbCount}`;
    const db = new TerpsicleDb(name);
    await db.plans.put(aPlan({ courses: [] }));
    db.close();
    expect(await planCount(name)).toBe(1);

    await db.open();
    await db.plans.put(aPlan({ id: "plan_b" }));
    expect(await db.plans.count()).toBe(2);
    db.close();
  });
});

describe("the returning flag", () => {
  it("is set once there's a plan, and never unset here", async () => {
    markReturning(0);
    expect(window.localStorage.getItem(RETURNING_FLAG_KEY)).toBeNull();
    markReturning(2);
    expect(window.localStorage.getItem(RETURNING_FLAG_KEY)).toBe("1");
    markReturning(0);
    expect(window.localStorage.getItem(RETURNING_FLAG_KEY)).toBe("1");
  });

  it("skips the marketing page on a router navigation, unless ?stay", async () => {
    expect(await skipMarketingInBrowser("")).toBe(false);
    markReturning(1);
    expect(await skipMarketingInBrowser("")).toBe(true);
    expect(await skipMarketingInBrowser("?stay")).toBe(false);
  });
});

describe("returningCheckScript", () => {
  it("is one self-contained script", () => {
    expect(() => new Function(returningCheckScript)).not.toThrow();
    expect(returningCheckScript).not.toMatch(/\bimport\b|__vite|require\(/);
  });
});
