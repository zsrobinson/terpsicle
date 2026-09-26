import { describe, expect, it } from "vitest";
import {
  aPlan,
  aPlanCourse,
  aPlanSyncDoc,
  aSettingsDoc,
  aSettingsSyncDoc,
} from "~/fixtures";
import {
  SYNC_MAX_BODY_BYTES,
  SYNC_MAX_PUSH_DOCS,
  SyncPullResultSchema,
  SyncPushInputSchema,
  syncBodyBytes,
  syncDocFromRow,
} from "./index";

const planDoc = (id = "plan_fixture_a") => ({
  kind: "plan" as const,
  id,
  baseRev: 0,
  body: aPlan({ id }),
});

describe("SyncPushInputSchema", () => {
  it("takes plans, deletes and the settings doc", () => {
    const input = {
      docs: [
        planDoc(),
        { kind: "plan", id: "plan_fixture_b", baseRev: 3, body: null },
        { kind: "settings", id: "settings", baseRev: 2, body: aSettingsDoc() },
      ],
    };
    expect(SyncPushInputSchema.parse(input)).toEqual(input);
  });

  it("refuses a plan body under another id", () => {
    const doc = { ...planDoc(), body: aPlan({ id: "plan_fixture_b" }) };
    expect(SyncPushInputSchema.safeParse({ docs: [doc] }).success).toBe(false);
  });

  it("never deletes the settings doc", () => {
    const doc = { kind: "settings", id: "settings", baseRev: 1, body: null };
    expect(SyncPushInputSchema.safeParse({ docs: [doc] }).success).toBe(false);
  });

  it("refuses the same doc twice, an empty push and an oversized batch", () => {
    const twice = { docs: [planDoc(), { ...planDoc(), baseRev: 1 }] };
    expect(SyncPushInputSchema.safeParse(twice).success).toBe(false);
    expect(SyncPushInputSchema.safeParse({ docs: [] }).success).toBe(false);
    const many = Array.from({ length: SYNC_MAX_PUSH_DOCS + 1 }, (_, i) =>
      planDoc(`plan_fixture_${String(i).padStart(3, "0")}`),
    );
    expect(SyncPushInputSchema.safeParse({ docs: many }).success).toBe(false);
    expect(SyncPushInputSchema.safeParse({ docs: many.slice(1) }).success).toBe(
      true,
    );
  });

  it("caps each body at SYNC_MAX_BODY_BYTES, counted as UTF-8", () => {
    // Add courses until the plan is just over the limit.
    const courses = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        aPlanCourse({ courseCode: `CMSC${String(100 + i)}` }),
      );
    let n = 1;
    while (syncBodyBytes(aPlan({ courses: courses(n) })) <= SYNC_MAX_BODY_BYTES)
      n++;
    const over = { ...planDoc(), body: aPlan({ courses: courses(n) }) };
    const under = { ...planDoc(), body: aPlan({ courses: courses(n - 1) }) };
    expect(SyncPushInputSchema.safeParse({ docs: [over] }).success).toBe(false);
    expect(SyncPushInputSchema.safeParse({ docs: [under] }).success).toBe(true);
  });

  it("measures bytes, not characters", () => {
    expect(syncBodyBytes(null)).toBe(0);
    expect(syncBodyBytes("é")).toBe(4); // two quotes and two bytes
  });

  it("rejects unknown keys on the envelope", () => {
    const extra = { docs: [planDoc()], force: true };
    expect(SyncPushInputSchema.safeParse(extra).success).toBe(false);
  });
});

describe("SyncPullResultSchema", () => {
  it("reads a page and a reset", () => {
    expect(
      SyncPullResultSchema.parse({
        status: "ok",
        cursor: 0,
        docs: [],
        more: false,
      }).status,
    ).toBe("ok");
    expect(SyncPullResultSchema.parse({ status: "reset" }).status).toBe(
      "reset",
    );
  });
});

describe("syncDocFromRow", () => {
  const row = {
    rev: 1,
    updated_at: "2026-09-25T12:00:00.000Z",
  };

  it("reads plans, tombstones and the settings doc", () => {
    const plan = aPlan();
    expect(
      syncDocFromRow({
        ...row,
        kind: "plan",
        doc_id: plan.id,
        deleted: 0,
        body: JSON.stringify(plan),
      }),
    ).toEqual(aPlanSyncDoc({ body: plan }));
    expect(
      syncDocFromRow({
        ...row,
        kind: "plan",
        doc_id: plan.id,
        deleted: 1,
        body: null,
      }),
    ).toEqual(aPlanSyncDoc({ id: plan.id, body: null }));
    expect(
      syncDocFromRow({
        ...row,
        kind: "settings",
        doc_id: "settings",
        deleted: 0,
        body: JSON.stringify(aSettingsDoc()),
      }),
    ).toEqual(aSettingsSyncDoc());
  });

  it("throws on a row the doc schemas don't accept", () => {
    expect(() =>
      syncDocFromRow({
        ...row,
        kind: "plan",
        doc_id: "plan_other_id",
        deleted: 0,
        body: JSON.stringify(aPlan()),
      }),
    ).toThrow();
  });
});
