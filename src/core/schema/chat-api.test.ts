import { describe, expect, it } from "vitest";
import { ChatRoomSearchSchema } from "./chat-api";

describe("ChatRoomSearchSchema", () => {
  it("takes the term and join back as text when the router read numbers", () => {
    expect(ChatRoomSearchSchema.parse({ term: 202608, join: 1 })).toEqual({
      term: "202608",
      join: 1,
    });
    expect(ChatRoomSearchSchema.parse({ join: "1" }).join).toBe(1);
  });

  it("drops what isn't one", () => {
    expect(ChatRoomSearchSchema.parse({ term: 2026 }).term).toBeUndefined();
    expect(ChatRoomSearchSchema.parse({ term: "fall" }).term).toBeUndefined();
    expect(
      ChatRoomSearchSchema.parse({ thread: "<b>" }).thread,
    ).toBeUndefined();
  });
});
