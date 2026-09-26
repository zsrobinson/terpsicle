import { describe, expect, it } from "vitest";
import { isElmsUrl, parseFeedLink } from "./link";

const TOKEN = "AbCdEf0123456789GhIjKlMnOpQrStUvWxYz0123";

describe("parseFeedLink", () => {
  it("accepts the feed link on either ELMS host", () => {
    for (const host of ["elms.umd.edu", "umd.instructure.com"]) {
      const link = `https://${host}/feeds/calendars/user_${TOKEN}.ics`;
      expect(parseFeedLink(link)).toBe(link);
    }
  });

  it("trims, rewrites webcal:// and lower-cases the scheme and host", () => {
    expect(
      parseFeedLink(
        `  webcal://ELMS.umd.edu/feeds/calendars/user_${TOKEN}.ics\n`,
      ),
    ).toBe(`https://elms.umd.edu/feeds/calendars/user_${TOKEN}.ics`);
    expect(
      parseFeedLink(`HTTPS://elms.umd.edu/feeds/calendars/user_${TOKEN}.ics`),
    ).toBe(`https://elms.umd.edu/feeds/calendars/user_${TOKEN}.ics`);
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
  ])("rejects %s", (_, link) => {
    expect(parseFeedLink(link)).toBeNull();
  });
});

describe("isElmsUrl", () => {
  it("accepts plain https on an ELMS host", () => {
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
