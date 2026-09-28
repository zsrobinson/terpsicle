import { describe, expect, it } from "vitest";
import type { ModerationReason } from "../schema/moderation";
import {
  adminAlertDue,
  type HeldItem,
  heldLabel,
  heldReason,
  heldWords,
  readHeldLabel,
} from "./admin-alert";
import { groupWords } from "./inbox";

const spam = (course: string | null): HeldItem => ({
  reason: "spam",
  surface: "chat",
  course,
});

describe("heldReason", () => {
  it("names the most serious urgent reason", () => {
    const crossRoom: ModerationReason = {
      code: "spam",
      source: "cross-room",
      action: "hold",
    };
    const violence: ModerationReason = {
      code: "violence",
      source: "guard",
      action: "hold",
    };
    const threat: ModerationReason = {
      code: "reported",
      source: "reports",
      action: "hold",
      report: "threat",
    };
    expect(heldReason([crossRoom])).toBe("spam");
    expect(heldReason([crossRoom, violence])).toBe("violence");
    expect(heldReason([violence, threat])).toBe("threat");
    // A flag isn't a hold, and nothing urgent is "other".
    expect(heldReason([{ ...violence, action: "flag" }])).toBe("other");
    expect(heldReason([])).toBe("other");
  });
});

describe("heldWords", () => {
  it("says what and where for one item", () => {
    expect(heldWords([spam("CMSC351")])).toEqual({
      title: "Held for you: spam in CMSC351",
      body: "Open the queue to decide.",
    });
    expect(
      heldWords([{ reason: "threat", surface: "review", course: null }]).title,
    ).toBe("Held for you: a threat in a review");
  });

  it("groups one reason across courses", () => {
    expect(
      heldWords([spam("CMSC351"), spam("CMSC131"), spam("MATH140")]),
    ).toEqual({
      title: "Held for you: spam in 3 courses",
      body: "CMSC131, CMSC351 and MATH140. Open the queue to decide.",
    });
    expect(heldWords([spam("CMSC351"), spam("CMSC351")]).title).toBe(
      "Held for you: spam in CMSC351",
    );
  });

  it("counts several reasons, most serious first", () => {
    expect(
      heldWords([
        spam("CMSC351"),
        spam("CMSC131"),
        { reason: "self-harm", surface: "chat", course: "MATH140" },
      ]),
    ).toEqual({
      title: "Held for you: 3 urgent items",
      body: "Self-harm in MATH140 and spam in 2 courses.",
    });
  });
});

describe("the label an inbox row keeps", () => {
  it("reads back what it wrote", () => {
    for (const item of [
      spam("CMSC351"),
      { reason: "violence", surface: "review", course: null } as const,
    ])
      expect(readHeldLabel(heldLabel(item))).toEqual(item);
    expect(readHeldLabel("CMSC351 0101")).toBeNull();
  });

  it("words an unread group of alerts as one", () => {
    const labels = [spam("CMSC351"), spam("CMSC131")].map(heldLabel);
    expect(
      groupWords(
        {
          type: "admin-urgent",
          title: "Held for you: spam in CMSC131",
          body: "",
        },
        { count: 2, labels },
      ).title,
    ).toBe("Held for you: spam in 2 courses");
  });
});

describe("adminAlertDue", () => {
  const now = new Date("2026-09-28T15:00:00Z");
  it("alerts at most once an hour", () => {
    expect(adminAlertDue(null, now)).toBe(true);
    expect(adminAlertDue("2026-09-28T14:01:00.000Z", now)).toBe(false);
    expect(adminAlertDue("2026-09-28T14:00:00.000Z", now)).toBe(true);
  });
});
