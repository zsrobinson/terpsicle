import { afterEach, describe, expect, it } from "vitest";
import { ACTIVITY_LOG_SIZE } from "~/core/feedback/props";
import {
  clearActivity,
  logError,
  logEvent,
  logFailedRequest,
  logNavigation,
  recentActivity,
} from "./activity-log";

afterEach(() => clearActivity());

describe("the activity log", () => {
  it("keeps the last 50 actions, oldest first", () => {
    for (let i = 0; i < ACTIVITY_LOG_SIZE + 10; i++)
      logEvent("tab_opened", { tab: `t${i}`, via: "click" });
    const log = recentActivity();
    expect(log).toHaveLength(ACTIVITY_LOG_SIZE);
    expect(log[0]).toMatchObject({ props: { tab: "t10" } });
    expect(log.at(-1)).toMatchObject({
      props: { tab: `t${ACTIVITY_LOG_SIZE + 9}` },
    });
  });

  it("keeps a route's pattern, never a share link's plan or a room", () => {
    logNavigation("/schedule?plan=eyJzZWN0aW9ucyI6W119&tab=search&q=calc");
    logNavigation("/chat/202608/CMSC131/0101");
    expect(recentActivity()).toMatchObject([
      { type: "nav", route: "/schedule?plan=shared&tab=search" },
      { type: "nav", route: "/chat/:term/:course/:room" },
    ]);
  });

  it("logs a route once, however often the router reports it", () => {
    logNavigation("/reviews");
    logNavigation("/reviews");
    expect(recentActivity()).toHaveLength(1);
  });

  it("keeps an error's name, message and stack", () => {
    const error = new TypeError("x is undefined");
    logError(error);
    logError("plain words");
    expect(recentActivity()).toMatchObject([
      { type: "error", name: "TypeError", message: "x is undefined" },
      { type: "error", name: "Error", message: "plain words", stack: null },
    ]);
    expect(recentActivity()[0]).toHaveProperty("stack", error.stack);
  });

  it("keeps a failed call's route and status, never a body", () => {
    logFailedRequest("/api/sync/push", 500);
    logFailedRequest("/api/me", 0);
    expect(recentActivity()).toMatchObject([
      { type: "request", method: "POST", route: "/api/sync/push", status: 500 },
      { type: "request", route: "/api/me", status: 0 },
    ]);
  });

  it("bounds event properties like analytics does", () => {
    logEvent("generate_run", {
      wildcards: ["pattern", "gen-ed"],
      nested: { no: true },
    });
    logEvent("Not An Event", {});
    expect(recentActivity()).toEqual([
      expect.objectContaining({
        name: "generate_run",
        props: { wildcards: "pattern,gen-ed" },
      }),
    ]);
  });
});
