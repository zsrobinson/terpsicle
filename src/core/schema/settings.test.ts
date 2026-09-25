import { describe, expect, it } from "vitest";
import { DEFAULT_MUST_HAVES } from "./generate";
import { SettingsRowSchema } from "./settings";

const TERM = "202701";

describe("generate drafts", () => {
  it("round-trips a draft per term in the settings table", () => {
    const row = {
      key: "generate",
      value: {
        [TERM]: {
          items: [{ kind: "course", courseCode: "CMSC351", required: true }],
          mustHaves: {
            ...DEFAULT_MUST_HAVES,
            earliestStart: 600,
            daysOff: ["F"],
          },
          rankBy: { preset: "compact" },
        },
      },
    };
    expect(SettingsRowSchema.parse(row)).toEqual(row);
  });

  it("keeps a pick group that's still being filled in", () => {
    const row = {
      key: "generate",
      value: {
        [TERM]: {
          items: [
            {
              kind: "pick",
              id: "g1",
              count: 2,
              courses: [{ courseCode: "MUSC130" }],
            },
          ],
          mustHaves: DEFAULT_MUST_HAVES,
          rankBy: { preset: "compact" },
        },
      },
    };
    expect(SettingsRowSchema.parse(row)).toEqual(row);
  });

  it("rejects a draft keyed by something other than a term", () => {
    expect(
      SettingsRowSchema.safeParse({ key: "generate", value: { nope: {} } })
        .success,
    ).toBe(false);
  });
});
