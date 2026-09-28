import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../schema/notifications";
import { easternHour, holdsPush, inQuietHours } from "./quiet";

// Winter is UTC-5, summer UTC-4 in College Park.
const winter = (hhmm: string) => new Date(`2027-01-15T${hhmm}:00-05:00`);
const summer = (hhmm: string) => new Date(`2026-09-28T${hhmm}:00-04:00`);

describe("quiet hours", () => {
  it("reads the hour in College Park, daylight saving included", () => {
    expect(easternHour(new Date("2027-01-15T04:30:00Z"))).toBe(23);
    expect(easternHour(new Date("2026-09-28T03:30:00Z"))).toBe(23);
    expect(easternHour(new Date("2026-09-28T04:00:00Z"))).toBe(0);
  });

  it("runs from 11pm to 8am, both seasons", () => {
    for (const at of [winter, summer]) {
      expect(inQuietHours(at("22:59"))).toBe(false);
      expect(inQuietHours(at("23:00"))).toBe(true);
      expect(inQuietHours(at("00:00"))).toBe(true);
      expect(inQuietHours(at("03:15"))).toBe(true);
      expect(inQuietHours(at("07:59"))).toBe(true);
      expect(inQuietHours(at("08:00"))).toBe(false);
      expect(inQuietHours(at("12:00"))).toBe(false);
    }
  });

  it("holds pushes at night while quiet hours are on", () => {
    const night = summer("02:00");
    const day = summer("14:00");
    const on = DEFAULT_NOTIFICATION_SETTINGS;
    expect(holdsPush(on, "chat-mention", night)).toBe(true);
    expect(holdsPush(on, "chat-reply", night)).toBe(true);
    expect(holdsPush(on, "todo-due", night)).toBe(true);
    expect(holdsPush(on, "chat-mention", day)).toBe(false);
    const off = { ...on, quietHours: { on: false } };
    expect(holdsPush(off, "chat-mention", night)).toBe(false);
  });

  it("lets seat openings through by default, with their own switch", () => {
    const night = winter("01:00");
    const on = DEFAULT_NOTIFICATION_SETTINGS;
    expect(holdsPush(on, "seat-open", night)).toBe(false);
    expect(
      holdsPush({ ...on, seatThroughQuiet: false }, "seat-open", night),
    ).toBe(true);
  });

  it("never holds the owner's urgent alerts", () => {
    expect(
      holdsPush(DEFAULT_NOTIFICATION_SETTINGS, "admin-urgent", winter("03:00")),
    ).toBe(false);
  });
});
