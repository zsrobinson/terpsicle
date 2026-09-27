import { describe, expect, it } from "vitest";
import { listSql, parseArgs, parseSince } from "./feedback";

const ID = "FBAAAAAAAAAAAAAAAAAAAA";

describe("parseSince", () => {
  it("reads days and hours", () => {
    expect(parseSince("7d")).toBe(7);
    expect(parseSince("30")).toBe(30);
    expect(parseSince("12h")).toBe(0.5);
    expect(parseSince("0d")).toBeNull();
    expect(parseSince("a week")).toBeNull();
  });
});

describe("parseArgs", () => {
  it("reads list and its filters", () => {
    expect(
      parseArgs([
        "list",
        "--since",
        "7d",
        "--status",
        "new",
        "--kind",
        "review",
        "--pr",
        "42",
        "--json",
      ]),
    ).toEqual({
      command: "list",
      sinceDays: 7,
      status: "new",
      kind: "review",
      pr: 42,
      json: true,
    });
    expect(parseArgs(["list"])).toEqual({
      command: "list",
      sinceDays: null,
      status: null,
      kind: null,
      pr: null,
      json: false,
    });
  });

  it("reads get, --out, --mark and --preview", () => {
    expect(parseArgs(["get", ID, "--out", "tmp/fb"])).toEqual({
      command: "get",
      id: ID,
      out: "tmp/fb",
      mark: null,
      preview: false,
    });
    expect(parseArgs(["get", ID, "--mark", "fixed", "--preview"])).toEqual({
      command: "get",
      id: ID,
      out: null,
      mark: "fixed",
      preview: true,
    });
  });

  it("says what's wrong", () => {
    expect(parseArgs([])).toEqual({ error: "Which command?" });
    expect(parseArgs(["delete"])).toEqual({
      error: 'Unknown command "delete".',
    });
    expect(parseArgs(["list", "--status", "done"])).toMatchObject({
      error: expect.stringContaining("--status is one of"),
    });
    expect(
      parseArgs(["list", "--kind", "review'; DROP TABLE feedback;--"]),
    ).toEqual({ error: "--kind is bug, idea or review." });
    expect(parseArgs(["list", "--pr", "1 OR 1=1"])).toEqual({
      error: "--pr takes a PR number.",
    });
    expect(parseArgs(["list", "--since"])).toEqual({
      error: "--since needs a value.",
    });
    expect(parseArgs(["list", "--mark", "fixed"])).toEqual({
      error: "Unknown option --mark.",
    });
    expect(parseArgs(["get", "abc"])).toEqual({
      error: "get needs an item's 22-character id.",
    });
    expect(parseArgs(["get", ID, "--mark", "done"])).toMatchObject({
      error: expect.stringContaining("--mark is one of"),
    });
  });
});

describe("listSql", () => {
  it("filters on what was asked, newest first", () => {
    const now = new Date("2026-09-27T12:00:00.000Z");
    const parsed = parseArgs([
      "list",
      "--since",
      "2d",
      "--status",
      "new",
      "--pr",
      "7",
    ]);
    if ("error" in parsed || parsed.command !== "list")
      throw new Error("parse");
    const query = listSql(parsed, now);
    expect(query).toContain("created_at >= '2026-09-25T12:00:00.000Z'");
    expect(query).toContain("status = 'new'");
    expect(query).toContain("host LIKE 'pr-7-%'");
    expect(query).toContain("deleted_at IS NULL");
    expect(query).toContain("ORDER BY created_at DESC");
  });
});
