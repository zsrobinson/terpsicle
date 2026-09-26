import { describe, expect, it } from "vitest";
import {
  TodoFeedStateSchema,
  TodoFetchErrorSchema,
  TodoFileItemSchema,
  TodoListInputSchema,
} from "./todo-api";

describe("todo API schemas", () => {
  it("lists at most 120 days, forwards", () => {
    const ok = (from: string, to: string) =>
      TodoListInputSchema.safeParse({ from, to }).success;
    expect(ok("2026-09-01", "2026-09-01")).toBe(true);
    expect(ok("2026-09-01", "2026-12-30")).toBe(true);
    expect(ok("2026-09-01", "2026-12-31")).toBe(false);
    expect(ok("2026-09-02", "2026-09-01")).toBe(false);
  });

  it("takes error codes from the fixed list only", () => {
    for (const code of ["timeout", "http-404", "http-503", "key"])
      expect(TodoFetchErrorSchema.safeParse(code).success).toBe(true);
    for (const code of ["http-4040", "https://elms.umd.edu", "Error: boom"])
      expect(TodoFetchErrorSchema.safeParse(code).success).toBe(false);
  });

  it("has no field that could carry the feed link", () => {
    expect(Object.keys(TodoFeedStateSchema.shape).sort()).toEqual([
      "itemCount",
      "lastError",
      "lastFetchAt",
      "lastSuccessAt",
      "source",
      "status",
    ]);
  });

  it("takes only a file item's structured fields", () => {
    const item = {
      uid: "a",
      title: "Homework 1",
      courseLabel: null,
      kind: "assignment",
      gradescope: false,
      dueAt: null,
      dueDate: "2026-10-01",
      link: null,
    };
    expect(TodoFileItemSchema.safeParse(item).success).toBe(true);
    expect(
      TodoFileItemSchema.safeParse({ ...item, description: "notes" }).success,
    ).toBe(false);
  });
});
