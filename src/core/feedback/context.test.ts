import { describe, expect, it } from "vitest";
import { aBlock, aPlan, aPlanCourse, aSavedCourse } from "~/fixtures";
import { type ActivityEntry, FeedbackContextSchema } from "../schema/feedback";
import {
  ACTIVITY_MAX_AGE_MS,
  browserName,
  buildFeedbackContext,
  type FeedbackContextInput,
  feedbackPlan,
} from "./context";
import { ACTIVITY_LOG_SIZE, boundedProps } from "./props";

const NOW = new Date("2026-09-27T15:00:00Z");
const at = (msAgo: number) => NOW.getTime() - msAgo;

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

function anInput(
  overrides: Partial<FeedbackContextInput> = {},
): FeedbackContextInput {
  return {
    version: "abc1234",
    userAgent: CHROME_MAC,
    screen: { width: 1512, height: 982, dpr: 2 },
    viewport: { width: 1280.4, height: 800 },
    online: true,
    theme: "dark",
    url: "/schedule?tab=search&q=calculus",
    actions: [],
    plan: null,
    settings: {},
    ...overrides,
  };
}

describe("browserName", () => {
  it("names the browser and the system", () => {
    expect(browserName(CHROME_MAC)).toBe("Chrome 141 · macOS");
    expect(browserName(SAFARI_IPHONE)).toBe("Safari 18.5 · iOS");
    expect(
      browserName(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
      ),
    ).toBe("Firefox 143 · Windows");
    expect(
      browserName(
        "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0",
      ),
    ).toBe("Edge 141 · Windows");
  });

  it("says so when it can't tell", () => {
    expect(browserName("")).toBe("Unknown browser");
  });
});

describe("boundedProps", () => {
  it("keeps short values, joins arrays and drops the rest", () => {
    expect(
      boundedProps(
        {
          tab: "search",
          n: 3,
          ok: true,
          none: null,
          wildcards: ["pattern", "gen-ed"],
          nested: { a: 1 },
          "bad key": "x",
          long: "x".repeat(300),
        },
        40,
      ),
    ).toEqual({
      tab: "search",
      n: 3,
      ok: true,
      none: null,
      wildcards: "pattern,gen-ed",
      long: `${"x".repeat(199)}…`,
    });
  });

  it("stops at the key limit", () => {
    const many = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`k${i}`, i]),
    );
    expect(Object.keys(boundedProps(many, 20))).toHaveLength(20);
  });
});

describe("feedbackPlan", () => {
  it("lists placed sections, saved courses and the term's blocks", () => {
    const plan = aPlan({
      courses: [
        aPlanCourse({ courseCode: "CMSC131", sectionCode: "0101" }),
        aSavedCourse("MATH140"),
      ],
    });
    expect(
      feedbackPlan(plan, [
        aBlock({ label: "Work", days: ["Tu", "Th"], start: 540, end: 615 }),
        aBlock({ id: "other", termId: "199901" }),
      ]),
    ).toEqual({
      termId: plan.termId,
      name: "Plan A",
      sections: ["CMSC131 0101"],
      bookmarks: ["MATH140"],
      blocks: [{ label: "Work", days: "TuTh", start: "09:00", end: "10:15" }],
    });
  });
});

describe("buildFeedbackContext", () => {
  it("builds a context the schema accepts, with the route scrubbed", () => {
    const context = buildFeedbackContext(anInput(), NOW);
    expect(FeedbackContextSchema.safeParse(context).success).toBe(true);
    expect(context).toMatchObject({
      version: "abc1234",
      browser: "Chrome 141 · macOS",
      viewport: { width: 1280, height: 800 },
      screen: { width: 1512, height: 982, dpr: 2 },
      theme: "dark",
      online: true,
      // The search query is never kept.
      route: "/schedule?tab=search",
    });
  });

  it("keeps the last actions from the past hour, oldest first", () => {
    const actions: ActivityEntry[] = [
      { type: "nav", at: at(ACTIVITY_MAX_AGE_MS + 1), route: "/old" },
      ...Array.from(
        { length: ACTIVITY_LOG_SIZE + 5 },
        (_, i): ActivityEntry => ({
          type: "nav",
          at: at(60_000 - i),
          route: `/schedule?tab=t${i}`,
        }),
      ),
      // From the future (a clock change): left out.
      { type: "nav", at: at(-5_000), route: "/future" },
    ];
    const context = buildFeedbackContext(anInput({ actions }), NOW);
    expect(context.actions).toHaveLength(ACTIVITY_LOG_SIZE);
    expect(context.actions[0]).toMatchObject({ route: "/schedule?tab=t5" });
    expect(context.actions.at(-1)).toMatchObject({
      route: `/schedule?tab=t${ACTIVITY_LOG_SIZE + 4}`,
    });
  });

  it("never carries a link, a token or a share link's plan", () => {
    const context = buildFeedbackContext(
      anInput({
        url: "/schedule?plan=eyJhbGciOiJIUzI1NiJ9abcdefghijklmnopqrstuvwxyz",
        actions: [
          {
            type: "error",
            at: at(1_000),
            name: "TypeError",
            message:
              "Failed to fetch https://umd.instructure.com/feeds/calendars/user_secret.ics",
            stack: "at f (https://terpsicle.com/assets/index-B3kd92Jd.js:1:2)",
          },
          {
            type: "request",
            at: at(900),
            method: "POST",
            route: "/chat/202608/CMSC131/0101",
            status: 500,
          },
        ],
        settings: { note: "see https://example.com/x" },
      }),
      NOW,
    );
    const text = JSON.stringify(context);
    expect(text).not.toContain("instructure");
    expect(text).not.toContain("eyJhbGci");
    expect(text).not.toContain("CMSC131");
    expect(text).not.toContain("example.com");
    expect(context.route).toBe("/schedule?plan=shared");
    expect(text).toContain("/assets/index-B3kd92Jd.js");
  });

  it("cuts long errors to the schema's limits", () => {
    const context = buildFeedbackContext(
      anInput({
        actions: [
          {
            type: "error",
            at: at(1),
            name: "E".repeat(150),
            message: "m ".repeat(400),
            stack: "s ".repeat(2_000),
          },
        ],
      }),
      NOW,
    );
    expect(FeedbackContextSchema.safeParse(context).success).toBe(true);
  });

  it("drops the oldest actions when the whole is too big", () => {
    const actions = Array.from(
      { length: ACTIVITY_LOG_SIZE },
      (_, i): ActivityEntry => ({
        type: "error",
        at: at(ACTIVITY_LOG_SIZE - i),
        name: `Error${i}`,
        message: "m ".repeat(249),
        stack: "s ".repeat(999),
      }),
    );
    const context = buildFeedbackContext(anInput({ actions }), NOW);
    expect(context.actions.length).toBeLessThan(ACTIVITY_LOG_SIZE);
    expect(context.actions.at(-1)).toMatchObject({
      name: `Error${ACTIVITY_LOG_SIZE - 1}`,
    });
    expect(FeedbackContextSchema.safeParse(context).success).toBe(true);
  });
});
