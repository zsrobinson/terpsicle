import { describe, expect, it } from "vitest";
import {
  type TodoConnectReason,
  TodoConnectReasonSchema,
  TodoConnectResultSchema,
  type TodoFetchFailure,
} from "../schema";
import { type ConnectAnswer, connectFailure, connectWords } from "./connect";

describe("connectFailure", () => {
  it.each<[TodoFetchFailure, "unreachable" | "not-a-calendar"]>([
    ["timeout", "unreachable"],
    ["network", "unreachable"],
    ["http-500", "unreachable"],
    ["http-502", "unreachable"],
    ["http-503", "unreachable"],
    ["http-599", "unreachable"],
    ["http-400", "not-a-calendar"],
    ["http-401", "not-a-calendar"],
    ["http-403", "not-a-calendar"],
    ["http-404", "not-a-calendar"],
    ["http-410", "not-a-calendar"],
    ["http-429", "not-a-calendar"],
    ["http-304", "not-a-calendar"],
    ["bad-redirect", "not-a-calendar"],
    ["too-large", "not-a-calendar"],
  ])("reads %s as %s, and passes the code on as the reason", (code, status) => {
    const answer = connectFailure(code);
    expect(answer).toEqual({ status, reason: code });
    // What the server answers is what the client's schema takes.
    expect(TodoConnectResultSchema.parse(answer)).toEqual(answer);
  });
});

describe("TodoConnectReasonSchema", () => {
  it("takes the fetcher's codes and not-recognized, and nothing else", () => {
    for (const code of [
      "timeout",
      "network",
      "too-large",
      "bad-redirect",
      "not-recognized",
      "http-100",
      "http-404",
      "http-599",
    ])
      expect(TodoConnectReasonSchema.safeParse(code).success).toBe(true);
    for (const code of [
      "key",
      "not-a-calendar",
      "http-600",
      "http-99",
      "http-4040",
      "http-4.4",
      "https://umd.instructure.com/feeds/calendars/user_x.ics",
      "",
    ])
      expect(TodoConnectReasonSchema.safeParse(code).success).toBe(false);
  });

  it("is required on a failed answer", () => {
    expect(
      TodoConnectResultSchema.safeParse({ status: "unreachable" }).success,
    ).toBe(false);
    expect(
      TodoConnectResultSchema.safeParse({
        status: "not-a-calendar",
        reason: "not-recognized",
        url: "https://umd.instructure.com/feeds/calendars/user_x.ics",
      }).success,
    ).toBe(false);
  });
});

describe("connectWords", () => {
  const failed = (reason: TodoConnectReason): ConnectAnswer =>
    reason === "not-recognized"
      ? { status: "not-a-calendar", reason }
      : connectFailure(reason);

  it.each<[TodoConnectReason, string]>([
    [
      "timeout",
      "ELMS took too long to send your calendar. Try again in a minute.",
    ],
    ["network", "We couldn't reach ELMS. Try again in a minute."],
    [
      "http-404",
      "ELMS doesn't know that link anymore; it changes if you reset it. Copy it again from Calendar Feed.",
    ],
    [
      "http-410",
      "ELMS doesn't know that link anymore; it changes if you reset it. Copy it again from Calendar Feed.",
    ],
    [
      "http-401",
      "ELMS turned the request away. Copy it again from Calendar Feed, and if it happens again, tell us with Feedback.",
    ],
    [
      "http-403",
      "ELMS turned the request away. Copy it again from Calendar Feed, and if it happens again, tell us with Feedback.",
    ],
    [
      "http-429",
      "ELMS is getting too many requests. Try again in a few minutes.",
    ],
    [
      "http-500",
      "ELMS is having trouble right now. Try again in a few minutes.",
    ],
    [
      "http-503",
      "ELMS is having trouble right now. Try again in a few minutes.",
    ],
    [
      "http-400",
      "ELMS answered with error 400. Copy it again from Calendar Feed, and if it happens again, tell us with Feedback.",
    ],
    [
      "http-304",
      "ELMS answered with error 304. Copy it again from Calendar Feed, and if it happens again, tell us with Feedback.",
    ],
    [
      "bad-redirect",
      "ELMS sent us somewhere that isn't ELMS, so we stopped. Copy it again from Calendar Feed.",
    ],
    [
      "too-large",
      "Your ELMS calendar is bigger than we can read (over 5 MB). Tell us with Feedback and we'll look into it.",
    ],
    [
      "not-recognized",
      "ELMS sent something that isn't a calendar. Copy it again from Calendar Feed and paste it here.",
    ],
  ])(
    "says %s as one sentence of what happened and what's next",
    (reason, words) => {
      expect(connectWords(failed(reason))).toBe(words);
    },
  );

  it.each<[ConnectAnswer["status"], string]>([
    [
      "invalid-link",
      "That isn't an ELMS calendar link. In ELMS, open Calendar, click Calendar Feed, and copy the link.",
    ],
    ["signed-out", "You've been signed out. Sign in again to connect ELMS."],
    [
      "rate-limited",
      "You've tried to connect a lot in the last hour. Try again later.",
    ],
    ["failed", "That didn't go through. Check your connection and try again."],
  ])("says %s plainly", (status, words) => {
    expect(connectWords({ status } as ConnectAnswer)).toBe(words);
  });

  it("gives every reason its own words, in the product's voice", () => {
    const reasons: TodoConnectReason[] = [
      "timeout",
      "network",
      "bad-redirect",
      "too-large",
      "not-recognized",
      "http-401",
      "http-404",
      "http-429",
      "http-500",
      "http-418",
    ];
    for (const reason of reasons) {
      const words = connectWords(failed(reason));
      // Never the link, nor anything that looks like one.
      expect(words).not.toMatch(/https?:|webcal:|user_|\.ics/);
      // No "cannot" or "could not": contractions (SPEC.md §3.13).
      expect(words).not.toMatch(/\b(cannot|could not|does not|is not)\b/);
      expect(words).toMatch(/\.$/);
    }
  });
});
