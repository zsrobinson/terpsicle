import { describe, expect, it } from "vitest";
import { PushTypeSchema } from "~/core/schema";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettingsSchema,
  NotificationTypeSchema,
} from "~/core/schema/notifications";
import {
  channelOn,
  deliveryKey,
  NOTIFICATION_CHANNELS,
  PUSH_DELIVERY,
  withChannel,
} from ".";

describe("channelOn and withChannel", () => {
  it("reads the defaults: seats by push and email, chat by push, no digest or Todo", () => {
    const d = DEFAULT_NOTIFICATION_SETTINGS;
    expect(channelOn(d, "seat-open", "push")).toBe(true);
    expect(channelOn(d, "seat-open", "email")).toBe(true);
    expect(channelOn(d, "chat-mention", "push")).toBe(true);
    expect(channelOn(d, "chat-reply", "push")).toBe(true);
    expect(channelOn(d, "chat-digest", "email")).toBe(false);
    expect(channelOn(d, "todo-due", "push")).toBe(false);
    // Channels a type doesn't have are never on.
    expect(channelOn(d, "chat-mention", "email")).toBe(false);
  });

  it("changes one channel and leaves the rest", () => {
    const next = withChannel(
      DEFAULT_NOTIFICATION_SETTINGS,
      "seat-open",
      "push",
      false,
    );
    expect(next.seatOpen).toEqual({ push: false, email: true });
    expect(next.chatMention).toBe(DEFAULT_NOTIFICATION_SETTINGS.chatMention);
    expect(withChannel(next, "todo-due", "push", true).todoDue).toEqual({
      push: true,
    });
    expect(
      withChannel(DEFAULT_NOTIFICATION_SETTINGS, "chat-mention", "email", true),
    ).toBe(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it("has a channel list for every type, and every one round-trips", () => {
    for (const type of NotificationTypeSchema.options) {
      for (const channel of NOTIFICATION_CHANNELS[type]) {
        const off = withChannel(
          DEFAULT_NOTIFICATION_SETTINGS,
          type,
          channel,
          false,
        );
        expect(channelOn(off, type, channel)).toBe(false);
        expect(
          channelOn(withChannel(off, type, channel, true), type, channel),
        ).toBe(true);
        expect(NotificationSettingsSchema.parse(off)).toEqual(off);
      }
    }
  });
});

describe("NotificationSettingsSchema", () => {
  it("reads a row saved before Todo's reminder as off (V3 §4)", () => {
    const { todoDue: _, ...before } = DEFAULT_NOTIFICATION_SETTINGS;
    expect(NotificationSettingsSchema.parse(before).todoDue).toEqual({
      push: false,
    });
  });
});

describe("PUSH_DELIVERY and deliveryKey", () => {
  it("covers every push type, with seats urgent and short-lived", () => {
    expect(Object.keys(PUSH_DELIVERY).sort()).toEqual(
      [...PushTypeSchema.options].sort(),
    );
    expect(PUSH_DELIVERY["seat-open"]).toEqual({ ttl: 3600, urgency: "high" });
  });

  it("appends the channel", () => {
    expect(deliveryKey("seat-open:u:202608:CMSC351-0101:t", "push")).toBe(
      "seat-open:u:202608:CMSC351-0101:t:push",
    );
  });
});
