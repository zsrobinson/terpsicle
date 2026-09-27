import { describe, expect, it } from "vitest";
import {
  feedbackImageKey,
  isFeedbackImageKey,
  retentionCutoffs,
} from "./retention";

const NOW = new Date("2027-03-15T12:00:00.000Z");

describe("retentionCutoffs", () => {
  it("keeps items a year, screenshots 180 days or 30 after closing", () => {
    expect(retentionCutoffs(NOW)).toEqual({
      rowsCreatedBefore: "2026-03-15T12:00:00.000Z",
      shotsCreatedBefore: "2026-09-16T12:00:00.000Z",
      shotsClosedBefore: "2027-02-13T12:00:00.000Z",
      undoCreatedBefore: "2027-03-15T11:50:00.000Z",
      deletedBefore: "2027-03-15T11:59:50.000Z",
    });
  });
});

describe("feedbackImageKey", () => {
  const id = "AAAAAAAAAAAAAAAAAAAAAA";

  it("files images by month", () => {
    expect(feedbackImageKey(id, NOW, "image/webp", "screenshot")).toBe(
      `feedback/2027-03/${id}.webp`,
    );
    expect(feedbackImageKey(id, NOW, "image/jpeg", "element")).toBe(
      `feedback/2027-03/${id}-element.jpg`,
    );
  });

  it("recognises only its own keys", () => {
    expect(
      isFeedbackImageKey(feedbackImageKey(id, NOW, "image/png", "element")),
    ).toBe(true);
    expect(isFeedbackImageKey(`avatars/${id}.png`)).toBe(false);
    expect(isFeedbackImageKey(`feedback/2027-03/../${id}.png`)).toBe(false);
  });
});
