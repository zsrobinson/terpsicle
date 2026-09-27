import { describe, expect, it } from "vitest";
import {
  FeedbackContextSchema,
  FeedbackPinInputSchema,
  FeedbackSendInputSchema,
  FeedbackUpdateInputSchema,
} from "./feedback";

const context = {
  version: "2026.09.26-abc123",
  browser: "Chrome 141 · macOS",
  screen: { width: 1512, height: 982, dpr: 2 },
  viewport: { width: 1512, height: 860 },
  online: true,
  theme: "dark",
  route: "/schedule?tab=search",
  actions: [
    { type: "nav", at: 1, route: "/schedule" },
    {
      type: "event",
      at: 2,
      name: "section_added",
      props: { course: "CMSC131" },
    },
    {
      type: "error",
      at: 3,
      name: "TypeError",
      message: "x is undefined",
      stack: null,
    },
    { type: "request", at: 4, method: "POST", route: "sync/push", status: 503 },
  ],
  plan: {
    termId: "202608",
    name: "Plan A",
    sections: ["CMSC131 0101"],
    bookmarks: ["MATH140"],
    blocks: [{ label: "Work", days: "MW", start: "09:00", end: "11:00" }],
  },
  settings: { travel: "walk", accessibleRoutes: false },
} as const;

const bug = {
  kind: "bug",
  product: "schedule",
  path: "/schedule?tab=search",
  text: "The section didn't add.",
  expected: "It shows on the calendar.",
  context,
};

describe("FeedbackSendInputSchema", () => {
  it("takes a bug with its context", () => {
    const parsed = FeedbackSendInputSchema.parse(bug);
    expect(parsed.reply).toBe(false);
    expect(parsed.context?.actions).toHaveLength(4);
  });

  it("trims text and refuses an empty report", () => {
    expect(FeedbackSendInputSchema.parse({ ...bug, text: "  hi  " }).text).toBe(
      "hi",
    );
    expect(
      FeedbackSendInputSchema.safeParse({ ...bug, text: "   " }).success,
    ).toBe(false);
  });

  it("gives only bugs an expected result", () => {
    expect(
      FeedbackSendInputSchema.safeParse({ ...bug, kind: "idea" }).success,
    ).toBe(false);
    const { expected: _, ...idea } = bug;
    expect(
      FeedbackSendInputSchema.safeParse({ ...idea, kind: "idea" }).success,
    ).toBe(true);
  });

  it("never takes a pinned note or unknown fields", () => {
    expect(
      FeedbackSendInputSchema.safeParse({ ...bug, kind: "review" }).success,
    ).toBe(false);
    expect(
      FeedbackSendInputSchema.safeParse({ ...bug, userId: "x" }).success,
    ).toBe(false);
  });

  it("wants base64 images of our three types", () => {
    const shot = (type: string, data = "iVBORw0KGgo=") => ({
      ...bug,
      screenshot: { type, data },
    });
    expect(FeedbackSendInputSchema.safeParse(shot("image/png")).success).toBe(
      true,
    );
    expect(
      FeedbackSendInputSchema.safeParse(shot("image/svg+xml")).success,
    ).toBe(false);
    expect(
      FeedbackSendInputSchema.safeParse(shot("image/png", "<svg/>")).success,
    ).toBe(false);
  });
});

describe("FeedbackContextSchema", () => {
  it("caps the activity log and its entries", () => {
    const actions = Array.from({ length: 61 }, (_, at) => ({
      type: "nav",
      at,
      route: "/",
    }));
    expect(
      FeedbackContextSchema.safeParse({ ...context, actions }).success,
    ).toBe(false);
    expect(
      FeedbackContextSchema.safeParse({
        ...context,
        actions: [
          {
            type: "request",
            at: 1,
            method: "POST",
            route: "x",
            status: 500,
            body: "{}",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("refuses long free text in event properties", () => {
    const props = { note: "x".repeat(201) };
    expect(
      FeedbackContextSchema.safeParse({
        ...context,
        actions: [{ type: "event", at: 1, name: "x", props }],
      }).success,
    ).toBe(false);
  });

  it("takes no plan when there isn't one", () => {
    expect(
      FeedbackContextSchema.safeParse({ ...context, plan: null }).success,
    ).toBe(true);
  });
});

describe("FeedbackPinInputSchema", () => {
  it("takes the element and only data-* ids", () => {
    const pin = {
      product: "schedule",
      path: "/schedule?course=CMSC131",
      text: "Too much padding here",
      element: {
        selector: "[data-course='CMSC131'] > button",
        text: "Add",
        ids: { "data-course": "CMSC131" },
        rect: { x: 10, y: 20, width: 30, height: 40 },
      },
      context: {
        version: "v",
        viewport: { width: 1, height: 1 },
        theme: "light",
      },
    };
    expect(FeedbackPinInputSchema.safeParse(pin).success).toBe(true);
    expect(
      FeedbackPinInputSchema.safeParse({
        ...pin,
        element: { ...pin.element, ids: { onclick: "x" } },
      }).success,
    ).toBe(false);
  });
});

describe("FeedbackUpdateInputSchema", () => {
  it("wants something to change", () => {
    const id = "AAAAAAAAAAAAAAAAAAAAAA";
    expect(FeedbackUpdateInputSchema.safeParse({ id }).success).toBe(false);
    expect(
      FeedbackUpdateInputSchema.safeParse({ id, note: null }).success,
    ).toBe(true);
    expect(
      FeedbackUpdateInputSchema.safeParse({ id, status: "fixed" }).success,
    ).toBe(true);
  });
});
