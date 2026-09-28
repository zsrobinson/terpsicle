import { describe, expect, it } from "vitest";
import { type PushPayload, PushPayloadSchema } from "../schema";
import { utf8 } from "./bytes";
import { PUSH_MAX_PLAINTEXT } from "./encrypt";
import { PUSH_MESSAGE_MAX_BYTES, pushMessage } from "./message";

const ORIGIN = "https://terpsicle.com";

const mention: PushPayload = {
  v: 1,
  type: "chat-mention",
  title: "Maya in CMSC351",
  body: "are we meeting at McKeldin at 7? I booked 2nd floor",
  url: "/chat?term=202701&course=CMSC351&room=202701%3ACMSC351",
  tag: "chat-mention:202701:CMSC351",
  count: 1,
  badge: 3,
  renotify: true,
  id: "chat-mention:tstudent:m1",
};

const size = (message: object) => utf8(JSON.stringify(message)).length;

describe("pushMessage", () => {
  it("says the notification twice: ours for the service worker, and declaratively for iOS 18.4+", () => {
    expect(pushMessage(mention, ORIGIN)).toEqual({
      ...mention,
      web_push: 8030,
      notification: {
        title: "Maya in CMSC351",
        body: "are we meeting at McKeldin at 7? I booked 2nd floor",
        navigate:
          "https://terpsicle.com/chat?term=202701&course=CMSC351&room=202701%3ACMSC351",
        tag: "chat-mention:202701:CMSC351",
        app_badge: "3",
      },
      mutable: true,
      app_badge: 3,
    });
  });

  it("stays a payload every installed service worker reads, for a release", () => {
    // What an older /sw.js (and ours) takes from it: the payload, unchanged.
    expect(PushPayloadSchema.parse(pushMessage(mention, ORIGIN))).toEqual(
      mention,
    );
  });

  it("clears the badge at 0, and leaves it alone when the push has none", () => {
    const cleared = pushMessage({ ...mention, badge: 0 }, ORIGIN);
    expect(cleared).toMatchObject({
      app_badge: 0,
      notification: { app_badge: "0" },
    });
    const { badge: _, ...test } = mention;
    const message = pushMessage(test, ORIGIN);
    expect(message).not.toHaveProperty("app_badge");
    expect(message).not.toHaveProperty("notification.app_badge");
  });

  it("links on the origin it's given, since WebKit needs an absolute URL", () => {
    expect(
      pushMessage({ ...mention, url: "/todo?day=2026-09-29" }, ORIGIN),
    ).toHaveProperty(
      "notification.navigate",
      "https://terpsicle.com/todo?day=2026-09-29",
    );
    expect(pushMessage(mention, "http://localhost:3000")).toHaveProperty(
      "notification.navigate",
      "http://localhost:3000/chat?term=202701&course=CMSC351&room=202701%3ACMSC351",
    );
  });

  it("cuts a body too long to say twice, in both places, without splitting a character", () => {
    const long = { ...mention, body: "🎉".repeat(400) };
    const message = pushMessage(long, ORIGIN);
    expect(size(message)).toBeLessThanOrEqual(PUSH_MESSAGE_MAX_BYTES);
    expect(message.body).toMatch(/^(🎉)+…$/u);
    expect("notification" in message && message.notification.body).toBe(
      message.body,
    );
    // As much as fits: one more (4 bytes, said twice) wouldn't.
    expect(size(message)).toBeGreaterThan(PUSH_MESSAGE_MAX_BYTES - 8);
    // And it's still a payload the service worker reads.
    expect(PushPayloadSchema.safeParse(message).success).toBe(true);
  });

  it("leaves a body that fits alone", () => {
    const body = "x".repeat(400);
    expect(pushMessage({ ...mention, body }, ORIGIN).body).toBe(body);
  });

  it("falls back to the plain payload when even an empty body can't fit", () => {
    const url = `/${"x".repeat(2000)}`;
    const huge = { ...mention, url, title: "t".repeat(120) };
    expect(pushMessage(huge, ORIGIN)).toEqual(huge);
    expect(size(huge)).toBeLessThanOrEqual(PUSH_MAX_PLAINTEXT);
  });
});
