import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { hasSavedWork } from "~/core/site";
import { aBlock, aPlan } from "~/fixtures";
import { TerpsicleDb } from "~/state/db";
import { landingCheckScript, readSavedWork } from "./landing";

let dbCount = 0;

const savedWork = (name: string) =>
  new Promise<boolean>((resolve) => readSavedWork(name, hasSavedWork, resolve));

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).flatMap((d) => (d.name ? [d.name] : []));
}

describe("readSavedWork", () => {
  it("answers no without creating a database when there isn't one", async () => {
    const name = `landing-${++dbCount}`;
    expect(await savedWork(name)).toBe(false);
    expect(await databaseNames()).not.toContain(name);
  });

  it("reads the app's own database", async () => {
    const name = `landing-${++dbCount}`;
    const db = new TerpsicleDb(name);
    await db.plans.put(aPlan({ courses: [] }));
    db.close();
    expect(await savedWork(name)).toBe(false);

    await db.open();
    await db.blocks.put(aBlock());
    db.close();
    expect(await savedWork(name)).toBe(true);
  });

  it("lets the app open the database afterwards", async () => {
    const name = `landing-${++dbCount}`;
    await savedWork(name);
    const db = new TerpsicleDb(name);
    await db.plans.put(aPlan());
    expect(await db.plans.count()).toBe(1);
    db.close();
  });
});

describe("landingCheckScript", () => {
  it("is one self-contained script", () => {
    expect(() => new Function(landingCheckScript)).not.toThrow();
    expect(landingCheckScript).not.toMatch(/\bimport\b|__vite|require\(/);
  });
});
