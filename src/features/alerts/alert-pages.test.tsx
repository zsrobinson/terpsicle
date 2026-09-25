import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiCallError } from "~/server/fns/api";
import { TooltipProvider } from "~/ui/tooltip";
import { ConfirmAlert } from "./confirm-alert";
import { clearAlertsInbox, readAlertsInbox } from "./inbox";
import { courseHref, termLabel } from "./labels";
import { UnsubscribeAlert } from "./unsubscribe-alert";

const TOKEN = "a".repeat(43);
const MANAGE = "m".repeat(43);
const SUB = "s".repeat(22);
const wrap = (node: ReactNode) =>
  render(<TooltipProvider>{node}</TooltipProvider>);

beforeEach(() => clearAlertsInbox());

describe("confirm page", () => {
  it("confirms once, says Watching, and hands the manage token to the app", async () => {
    const confirm = vi.fn(async () => ({
      status: "confirmed" as const,
      termId: "202701",
      sectionKey: "CMSC351-0101",
      subscriptionId: SUB,
      manageToken: MANAGE,
    }));
    wrap(
      <ConfirmAlert
        token={TOKEN}
        confirm={confirm}
        now={() => new Date("2026-10-01T12:00:00.000Z")}
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Watching" }),
    ).toBeInTheDocument();
    expect(screen.getByText("CMSC351 0101")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open in Terpsicle" }),
    ).toHaveAttribute("href", "/?term=202701&course=CMSC351");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(readAlertsInbox()).toEqual([
      {
        termId: "202701",
        sectionKey: "CMSC351-0101",
        subscriptionId: SUB,
        manageToken: MANAGE,
        status: "active",
        at: "2026-10-01T12:00:00.000Z",
      },
    ]);
  });

  it("explains an expired or used link", async () => {
    wrap(
      <ConfirmAlert
        token={TOKEN}
        confirm={async () => ({ status: "invalid-token" })}
      />,
    );
    expect(
      await screen.findByRole("heading", {
        name: "This link doesn't work anymore",
      }),
    ).toBeInTheDocument();
    expect(readAlertsInbox()).toEqual([]);
  });

  it("says when alerts are off", async () => {
    wrap(
      <ConfirmAlert
        token={TOKEN}
        confirm={async () => {
          throw new ApiCallError("unavailable");
        }}
      />,
    );
    expect(
      await screen.findByText(/Seat alerts are turned off/),
    ).toBeInTheDocument();
  });
});

describe("unsubscribe page", () => {
  it("asks first, then stops", async () => {
    const lookup = vi.fn(async () => ({
      status: "found" as const,
      termId: "202701",
      sectionKey: "CMSC351-0101",
      subscriptionStatus: "active" as const,
    }));
    const unsubscribe = vi.fn(async () => ({
      status: "unsubscribed" as const,
      termId: "202701",
      sectionKey: "CMSC351-0101",
    }));
    wrap(
      <UnsubscribeAlert
        token={TOKEN}
        lookup={lookup}
        unsubscribe={unsubscribe}
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Stop seat alerts?" }),
    ).toBeInTheDocument();
    expect(unsubscribe).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Stop alerts" }));
    expect(
      await screen.findByRole("heading", { name: "Seat alerts stopped" }),
    ).toBeInTheDocument();
    expect(unsubscribe).toHaveBeenCalledWith({ token: TOKEN });
  });

  it("handles a missing token without calling the API", async () => {
    const lookup = vi.fn();
    wrap(<UnsubscribeAlert token={undefined} lookup={lookup} />);
    expect(
      await screen.findByRole("heading", { name: "This link doesn't work" }),
    ).toBeInTheDocument();
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("labels", () => {
  it("names terms the way Testudo does", () => {
    expect(termLabel("202701")).toBe("Spring 2027");
    expect(termLabel("202612")).toBe("Winter 2027");
    expect(termLabel("202608")).toBe("Fall 2026");
    expect(courseHref("202701", "CMSC351-0101")).toBe(
      "/?term=202701&course=CMSC351",
    );
  });
});
