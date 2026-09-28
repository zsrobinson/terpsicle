import { describe, expect, it } from "vitest";
import {
  appendInboxPage,
  bellCount,
  bellLabel,
  inboxDay,
  inboxDays,
  inboxMeta,
  inboxWhen,
  markInboxRead,
} from "./bell";

// 6:30pm on Sunday, Sep 27 2026, in College Park (EDT, UTC-4).
const NOW = "2026-09-27T22:30:00.000Z";

describe("the bell", () => {
  it("counts to nine, then says 9+", () => {
    expect(bellCount(1)).toBe("1");
    expect(bellCount(9)).toBe("9");
    expect(bellCount(10)).toBe("9+");
    expect(bellCount(250)).toBe("9+");
  });

  it("says how many are unread to a screen reader, and nothing when none", () => {
    expect(bellLabel(4)).toBe("Notifications, 4 unread");
    expect(bellLabel(0)).toBe("Notifications");
  });
});

describe("days", () => {
  it("groups by College Park's day, not UTC's", () => {
    // 11:30pm on the 26th in College Park is already the 27th in UTC.
    expect(inboxDay("2026-09-27T03:30:00.000Z", NOW)).toBe("Yesterday");
    // Just after midnight in College Park.
    expect(inboxDay("2026-09-27T04:05:00.000Z", NOW)).toBe("Today");
    expect(inboxDay("2026-09-25T15:00:00.000Z", NOW)).toBe("Earlier");
    // A clock a little ahead of ours still reads as today.
    expect(inboxDay("2026-09-27T22:31:00.000Z", NOW)).toBe("Today");
  });

  it("keeps the server's order and leaves out empty days", () => {
    const items = [
      { id: "a", createdAt: "2026-09-27T22:28:00.000Z" },
      { id: "b", createdAt: "2026-09-27T14:00:00.000Z" },
      { id: "c", createdAt: "2026-09-20T14:00:00.000Z" },
      { id: "d", createdAt: "2026-09-19T14:00:00.000Z" },
    ];
    expect(inboxDays(items, NOW)).toEqual([
      { day: "Today", items: [items[0], items[1]] },
      { day: "Earlier", items: [items[2], items[3]] },
    ]);
    expect(inboxDays([], NOW)).toEqual([]);
  });
});

describe("the meta line", () => {
  it("is minutes in the last hour, then the time, then the date", () => {
    expect(inboxWhen("2026-09-27T22:29:40.000Z", NOW)).toBe("now");
    expect(inboxWhen("2026-09-27T22:28:00.000Z", NOW)).toBe("2m");
    expect(inboxWhen("2026-09-27T21:31:00.000Z", NOW)).toBe("59m");
    expect(inboxWhen("2026-09-27T22:01:00.000Z", NOW)).toBe("29m");
    expect(inboxWhen("2026-09-27T22:00:00.000Z", NOW)).toBe("30m");
    expect(inboxWhen("2026-09-27T21:00:00.000Z", NOW)).toBe("5:00pm");
    expect(inboxWhen("2026-09-27T01:14:00.000Z", NOW)).toBe("9:14pm");
    expect(inboxWhen("2026-09-24T22:00:00.000Z", NOW)).toBe("Sep 24");
  });

  it("names the product first", () => {
    expect(
      inboxMeta(
        { product: "chat", createdAt: "2026-09-27T22:28:00.000Z" },
        NOW,
      ),
    ).toBe("Chat · 2m");
    expect(
      inboxMeta(
        { product: "todo", createdAt: "2026-09-27T22:00:00.000Z" },
        "2026-09-27T23:10:00.000Z",
      ),
    ).toBe("Todo · 6:00pm");
    expect(inboxMeta({ product: "schedule", createdAt: NOW }, NOW)).toBe(
      "Schedule · now",
    );
    expect(inboxMeta({ product: "admin", createdAt: NOW }, NOW)).toBe(
      "Admin · now",
    );
  });
});

describe("reading and paging", () => {
  const items = [
    { id: "a", readAt: null },
    { id: "b", readAt: "2026-09-26T10:00:00.000Z" },
    { id: "c", readAt: null },
  ];

  it("reads the items named, or all, and keeps when earlier ones were read", () => {
    expect(markInboxRead(items, NOW, ["c"])).toEqual([
      { id: "a", readAt: null },
      items[1],
      { id: "c", readAt: NOW },
    ]);
    expect(markInboxRead(items, NOW)).toEqual([
      { id: "a", readAt: NOW },
      items[1],
      { id: "c", readAt: NOW },
    ]);
  });

  it("adds an older page without repeating what's shown", () => {
    expect(
      appendInboxPage(items, [
        { id: "c", readAt: null },
        { id: "d", readAt: null },
      ]),
    ).toEqual([...items, { id: "d", readAt: null }]);
  });
});
