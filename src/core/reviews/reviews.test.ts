import { describe, expect, it } from "vitest";
import {
  InstructorSlugSchema,
  MintedInstructorIdSchema,
  type ModerationReason,
  PublicReviewSchema,
  REVIEW_GRADES,
  ReviewGradeSchema,
} from "~/core/schema";
import {
  createdMonth,
  isBurst,
  MINTED_ID_BYTES,
  mainReason,
  mintedInstructorId,
  REVIEW_HELD_WORDS,
  REVIEW_LIMITS,
  reviewProblemWords,
  reviewTextKey,
  stageZeroProblems,
  weeklyLimitWait,
} from "./index";

const GOOD =
  "Lectures were clear and the exams matched the homework. Office hours helped a lot.";

describe("stageZeroProblems", () => {
  it("passes a plain review", () => {
    expect(stageZeroProblems(GOOD)).toEqual([]);
  });

  it("sends back what a rule would hold or remove, with where it is", () => {
    const body = `${GOOD} More at https://example.com/notes or 301-555-0123.`;
    const problems = stageZeroProblems(body);
    expect(problems.map((p) => p.code)).toEqual(["link", "phone"]);
    const [link] = problems;
    expect(link?.span && body.slice(...link.span)).toContain("example.com");
  });

  it("allows umd.edu links", () => {
    expect(
      stageZeroProblems(`${GOOD} See https://www.cs.umd.edu/class.`),
    ).toEqual([]);
  });

  it("says a short or long review's length, not a bare error", () => {
    expect(stageZeroProblems("Too short.")).toEqual([{ code: "too-short" }]);
    expect(stageZeroProblems("a".repeat(2_001))).toEqual([
      { code: "too-long" },
    ]);
    expect(stageZeroProblems("   ")).toEqual([{ code: "empty" }]);
  });

  it("leaves flags to the models", () => {
    // "stupid" is an insult: a flag, which only asks the policy model to look.
    expect(
      stageZeroProblems(`${GOOD} The curve policy felt stupid to me.`),
    ).toEqual([]);
  });

  it("has words for every problem it can find", () => {
    const body = `${GOOD} https://chegg.com/x terp@umd.edu 301-555-0123 UID 123456789`;
    for (const p of stageZeroProblems(body))
      expect(reviewProblemWords(p.code)).toMatch(/^Take out/);
    expect(reviewProblemWords("duplicate")).toBe(
      "This review is already posted.",
    );
    expect(reviewProblemWords("too-short")).toContain("40");
    expect(REVIEW_HELD_WORDS).toContain("You can edit it while it waits.");
  });
});

describe("reviewTextKey", () => {
  it("matches copies that differ only in case, spacing and punctuation", () => {
    expect(reviewTextKey("Great   lectures!! Hard exams.")).toBe(
      reviewTextKey("great lectures — hard exams"),
    );
    expect(reviewTextKey("ﬁne")).toBe("fine");
  });

  it("keeps the words themselves", () => {
    expect(reviewTextKey("Great lectures")).not.toBe(
      reviewTextKey("Great lecture"),
    );
  });
});

describe("createdMonth", () => {
  it("rounds to the month in College Park", () => {
    expect(createdMonth("2026-10-15T12:00:00.000Z")).toBe("2026-10");
    // 9pm on October 31 in College Park is already November in UTC.
    expect(createdMonth("2026-11-01T01:00:00.000Z")).toBe("2026-10");
    expect(createdMonth("2027-01-01T05:00:00.000Z")).toBe("2027-01");
  });

  it("is what PublicReviewSchema expects", () => {
    const month = createdMonth("2026-03-02T00:00:00.000Z");
    expect(() =>
      PublicReviewSchema.parse({
        id: "AAAAAAAAAAAAAAAAAAAAAA",
        course: "CMSC351",
        termId: null,
        rating: 4,
        grade: null,
        body: GOOD,
        createdMonth: month,
        edited: false,
      }),
    ).not.toThrow();
  });
});

describe("mintedInstructorId", () => {
  it("is t~ and 10 base32 characters", () => {
    expect(mintedInstructorId(new Uint8Array(MINTED_ID_BYTES))).toBe(
      "t~aaaaaaaaaa",
    );
    const id = mintedInstructorId(
      new Uint8Array([255, 255, 255, 255, 255, 255, 255]),
    );
    expect(id).toBe("t~7777777777");
    expect(MintedInstructorIdSchema.parse(id)).toBe(id);
  });

  it("is a valid instructor id wherever a PlanetTerp slug is", () => {
    const id = mintedInstructorId(new Uint8Array([1, 2, 3, 4, 5, 6, 7]));
    expect(InstructorSlugSchema.parse(id)).toBe(id);
    expect(InstructorSlugSchema.safeParse("kruskal").success).toBe(true);
  });

  it("needs enough random bytes", () => {
    expect(() => mintedInstructorId(new Uint8Array(3))).toThrow();
  });
});

describe("weeklyLimitWait", () => {
  const now = new Date("2026-10-10T12:00:00.000Z");
  const hoursAgo = (h: number) =>
    new Date(now.getTime() - h * 3_600_000).toISOString();

  it("is null under the limit", () => {
    expect(weeklyLimitWait([], now)).toBeNull();
    const nine = Array.from({ length: 9 }, (_, i) => hoursAgo(i));
    expect(weeklyLimitWait(nine, now)).toBeNull();
  });

  it("waits until the oldest in the window ages out", () => {
    const ten = Array.from({ length: REVIEW_LIMITS.perWeek }, (_, i) =>
      hoursAgo(i * 10),
    );
    // The oldest is 90 hours old: 78 hours to go.
    expect(weeklyLimitWait(ten, now)).toBe(78 * 3600);
  });

  it("ignores reviews older than a week", () => {
    const old = Array.from({ length: 20 }, () => hoursAgo(24 * 8));
    expect(weeklyLimitWait(old, now)).toBeNull();
  });
});

describe("isBurst", () => {
  it("lets the first five of a day through", () => {
    expect(isBurst({ lastDay: 0, last30Days: 0 })).toBe(false);
    expect(isBurst({ lastDay: 4, last30Days: 4 })).toBe(false);
  });

  it("holds the sixth for a quiet instructor", () => {
    expect(isBurst({ lastDay: 5, last30Days: 5 })).toBe(true);
  });

  it("gives a popular instructor room up to 3× their usual day", () => {
    // 90 in 30 days is 3 a day: a burst starts past 9.
    expect(isBurst({ lastDay: 8, last30Days: 90 })).toBe(false);
    expect(isBurst({ lastDay: 9, last30Days: 90 })).toBe(true);
  });
});

describe("mainReason", () => {
  const reason = (
    code: ModerationReason["code"],
    source: ModerationReason["source"],
    action: ModerationReason["action"],
  ): ModerationReason => ({ code, source, action });

  it("prefers what the author can fix", () => {
    expect(
      mainReason(
        [
          reason("model-unavailable", "system", "hold"),
          reason("hate", "guard", "hold"),
          reason("targets-person", "policy", "hold"),
          reason("insult", "rules", "flag"),
        ],
        "hold",
      ),
    ).toBe("targets-person");
  });

  it("names the removing reason for a removal", () => {
    expect(
      mainReason(
        [reason("spam", "policy", "remove"), reason("link", "rules", "hold")],
        "remove",
      ),
    ).toBe("spam");
  });

  it("falls back when nothing says why", () => {
    expect(mainReason([], "remove")).toBe("admin");
    expect(mainReason([], "hold")).toBe("model-unavailable");
  });
});

describe("grades", () => {
  it("takes letter grades, W and P", () => {
    expect(REVIEW_GRADES).toContain("P");
    expect(ReviewGradeSchema.safeParse("95").success).toBe(false);
  });
});
