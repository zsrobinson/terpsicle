import { describe, expect, it } from "vitest";
import type { FeedbackContext } from "../schema/feedback";
import { redactSecrets, sanitizeContext } from "./sanitize";

describe("redactSecrets", () => {
  it("drops links and tokens", () => {
    expect(
      redactSecrets(
        "Failed https://umd.instructure.com/feeds/calendars/user_Ab12.ics and webcal://x.y/z",
      ),
    ).toBe("Failed [link] and [link]");
    expect(
      redactSecrets("token eyJhbGciOiJIUzI1NiJ9abcdefghijklmnopqrstu done"),
    ).toBe("token [token] done");
  });

  it("keeps our own built files in a stack", () => {
    const frame =
      "at f (https://terpsicle.com/assets/index-B3kd92Jd.js:1:2345)";
    expect(redactSecrets(frame)).toBe(frame);
    expect(redactSecrets("at https://terpsicle.com/assets/x.js?t=1")).toBe(
      "at [link]",
    );
  });

  it("leaves plain words alone", () => {
    expect(
      redactSecrets("Cannot read properties of undefined (reading 'code')"),
    ).toBe("Cannot read properties of undefined (reading 'code')");
  });
});

describe("sanitizeContext", () => {
  const context: FeedbackContext = {
    version: "v",
    browser: "b",
    screen: { width: 1, height: 1, dpr: 1 },
    viewport: { width: 1, height: 1 },
    online: true,
    theme: "light",
    route: "/schedule?plan=eyJzZWN0aW9ucyI6W119&tab=search",
    actions: [
      { type: "nav", at: 1, route: "/chat/CMSC131/0101" },
      {
        type: "request",
        at: 2,
        method: "POST",
        route: "/api/todo/connect?x=1",
        status: 400,
      },
      {
        type: "event",
        at: 3,
        name: "x",
        props: { link: "https://evil.example/a" },
      },
      {
        type: "error",
        at: 4,
        name: "Error",
        message: "bad https://a.b/c",
        stack: null,
      },
    ],
    plan: null,
    settings: {
      feed: "webcal://umd.instructure.com/feeds/x.ics",
      pace: "normal",
    },
  };

  it("scrubs routes and redacts secrets everywhere text can hide", () => {
    const out = sanitizeContext(context);
    expect(out.route).toBe("/schedule?plan=shared&tab=search");
    expect(out.actions).toEqual([
      { type: "nav", at: 1, route: "/chat/:course/:room" },
      {
        type: "request",
        at: 2,
        method: "POST",
        route: "/api/todo/connect",
        status: 400,
      },
      { type: "event", at: 3, name: "x", props: { link: "[link]" } },
      {
        type: "error",
        at: 4,
        name: "Error",
        message: "bad [link]",
        stack: null,
      },
    ]);
    expect(out.settings).toEqual({ feed: "[link]", pace: "normal" });
  });
});
