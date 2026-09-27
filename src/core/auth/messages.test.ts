import { describe, expect, it } from "vitest";
import { SIGN_IN_PITCH, signInPitch } from "./messages";

describe("signInPitch", () => {
  it("says what signing in adds on each product's pages", () => {
    expect(signInPitch("/todo")).toMatch(/ELMS calendar link/);
    expect(signInPitch("/todo/connect")).toMatch(/ELMS calendar link/);
    expect(signInPitch("/reviews/courses/CMSC131")).toMatch(/write reviews/);
    expect(signInPitch("/chat")).toBe("Sign in to join your class chats.");
    expect(signInPitch("/schedule/search")).toMatch(/watch for a seat/);
    expect(signInPitch("/plan")).toMatch(/four-year plan/);
  });

  it("falls back to the general pitch elsewhere", () => {
    expect(signInPitch("/settings")).toBe(SIGN_IN_PITCH);
    expect(signInPitch("/")).toBe(SIGN_IN_PITCH);
    // A prefix isn't a product.
    expect(signInPitch("/todos")).toBe(SIGN_IN_PITCH);
  });
});
