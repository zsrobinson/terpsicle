import { describe, expect, it } from "vitest";
import { anUnpublishedCalendar, aPublishedCalendar, aTerm } from "~/fixtures";
import { chatRetention } from "./retention";

const NOW = Date.parse("2027-06-01T12:00:00.000Z");

describe("chatRetention", () => {
  it("turns rooms read-only after the 10th day past the last day of classes", () => {
    // Classes end Tuesday May 11, 2027: writable through May 21 in College
    // Park (EDT), deleted 60 days later.
    const r = chatRetention(aPublishedCalendar(), aTerm(), NOW);
    expect(r && new Date(r.readOnlyAt).toISOString()).toBe(
      "2027-05-22T04:00:00.000Z",
    );
    expect(r && new Date(r.deleteAt).toISOString()).toBe(
      "2027-07-21T04:00:00.000Z",
    );
  });

  it("uses EST in the fall", () => {
    const r = chatRetention(
      aPublishedCalendar({ classesEnd: "2026-12-10" }),
      aTerm(),
      NOW,
    );
    expect(r && new Date(r.readOnlyAt).toISOString()).toBe(
      "2026-12-21T05:00:00.000Z",
    );
  });

  it("goes read-only now for an archived term with no calendar", () => {
    expect(
      chatRetention(
        anUnpublishedCalendar(),
        aTerm({ status: "archived" }),
        NOW,
      ),
    ).toEqual({ readOnlyAt: NOW, deleteAt: NOW + 60 * 86_400_000 });
    expect(
      chatRetention(null, aTerm({ status: "archived" }), NOW)?.readOnlyAt,
    ).toBe(NOW);
  });

  it("waits while neither is known", () => {
    expect(chatRetention(anUnpublishedCalendar(), aTerm(), NOW)).toBeNull();
    expect(chatRetention(null, null, NOW)).toBeNull();
  });
});
