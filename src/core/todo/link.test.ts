import { describe, expect, it } from "vitest";
import { isElmsUrl, parseFeedLink } from "./link";

const TOKEN = "AbCdEf0123456789GhIjKlMnOpQrStUvWxYz0123";

describe("parseFeedLink", () => {
  const CANVAS = `https://umd.instructure.com/feeds/calendars/user_${TOKEN}.ics`;

  it("accepts the feed link on Canvas's host as it is", () => {
    expect(parseFeedLink(CANVAS)).toBe(CANVAS);
  });

  it("moves a feed link on elms.umd.edu, which serves no feeds, to Canvas's host", () => {
    expect(
      parseFeedLink(`https://elms.umd.edu/feeds/calendars/user_${TOKEN}.ics`),
    ).toBe(CANVAS);
    expect(
      parseFeedLink(`webcal://ELMS.UMD.EDU/feeds/calendars/user_${TOKEN}.ics`),
    ).toBe(CANVAS);
  });

  it("keeps the token exactly as pasted when it moves the host", () => {
    const mixed = "aBcD1234EfGh5678IjKl9012";
    expect(
      parseFeedLink(`https://elms.umd.edu/feeds/calendars/user_${mixed}.ics`),
    ).toBe(`https://umd.instructure.com/feeds/calendars/user_${mixed}.ics`);
  });

  it("trims, rewrites webcal:// and lower-cases the scheme and host", () => {
    expect(
      parseFeedLink(
        `  webcal://UMD.Instructure.com/feeds/calendars/user_${TOKEN}.ics\n`,
      ),
    ).toBe(CANVAS);
    expect(
      parseFeedLink(
        `HTTPS://umd.instructure.com/feeds/calendars/user_${TOKEN}.ics`,
      ),
    ).toBe(CANVAS);
  });

  it.each([
    ["http", `http://elms.umd.edu/feeds/calendars/user_${TOKEN}.ics`],
    [
      "another host",
      `https://elms.umd.edu.example.com/feeds/calendars/user_${TOKEN}.ics`,
    ],
    ["a subdomain", `https://x.elms.umd.edu/feeds/calendars/user_${TOKEN}.ics`],
    ["a port", `https://elms.umd.edu:8443/feeds/calendars/user_${TOKEN}.ics`],
    [
      "credentials",
      `https://me:pw@elms.umd.edu/feeds/calendars/user_${TOKEN}.ics`,
    ],
    ["a query", `https://elms.umd.edu/feeds/calendars/user_${TOKEN}.ics?x=1`],
    ["a fragment", `https://elms.umd.edu/feeds/calendars/user_${TOKEN}.ics#x`],
    [
      "another path",
      `https://elms.umd.edu/feeds/calendars/course_${TOKEN}.ics`,
    ],
    [
      "an upper-case path",
      `https://elms.umd.edu/FEEDS/calendars/user_${TOKEN}.ics`,
    ],
    ["a short token", "https://elms.umd.edu/feeds/calendars/user_abc123.ics"],
    [
      "a long token",
      `https://elms.umd.edu/feeds/calendars/user_${"a".repeat(81)}.ics`,
    ],
    [
      "a symbol in the token",
      `https://elms.umd.edu/feeds/calendars/user_${TOKEN}-x.ics`,
    ],
    ["no scheme", `elms.umd.edu/feeds/calendars/user_${TOKEN}.ics`],
    [
      "text around it",
      `my link: https://elms.umd.edu/feeds/calendars/user_${TOKEN}.ics`,
    ],
    ["nothing", ""],
    [
      "another path on Canvas's host",
      `https://umd.instructure.com/calendar/user_${TOKEN}.ics`,
    ],
    [
      "a query on Canvas's host",
      `https://umd.instructure.com/feeds/calendars/user_${TOKEN}.ics?x=1`,
    ],
  ])("rejects %s", (_, link) => {
    expect(parseFeedLink(link)).toBeNull();
  });
});

describe("isElmsUrl", () => {
  it("accepts plain https on either ELMS host", () => {
    expect(isElmsUrl("https://elms.umd.edu/courses/1/assignments/2")).toBe(
      true,
    );
    expect(isElmsUrl("https://umd.instructure.com/calendar#x")).toBe(true);
  });

  it.each([
    "http://elms.umd.edu/x",
    "https://www.gradescope.com/courses/1",
    "https://elms.umd.edu:8443/x",
    "https://me@elms.umd.edu/x",
    "javascript:alert(1)",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isElmsUrl(url)).toBe(false);
  });
});
