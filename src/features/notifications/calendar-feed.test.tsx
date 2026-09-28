import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/lib/analytics";
import { ApiCallError } from "~/server/fns/api";
import { calendarFeedApi } from "~/server/fns/calendar-feed";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { CalendarFeedSection } from "./calendar-feed";

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("~/server/fns/calendar-feed", () => ({
  calendarFeedApi: { link: vi.fn(), reset: vi.fn() },
}));

const api = vi.mocked(calendarFeedApi);
const TOKEN = "a".repeat(64);
const URL_1 = `https://terpsicle.com/cal/${TOKEN}.ics`;
const URL_2 = `https://terpsicle.com/cal/${"b".repeat(64)}.ics`;

function renderSection() {
  const user = userEvent.setup();
  render(
    <TooltipProvider delayDuration={0}>
      <CalendarFeedSection />
      <Toaster />
    </TooltipProvider>,
  );
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.link.mockResolvedValue({ url: URL_1, created: true });
  api.reset.mockResolvedValue({ url: URL_2 });
});

afterEach(async () => {
  toast.dismiss();
  await waitFor(() =>
    expect(document.querySelector("[data-sonner-toast]")).toBeNull(),
  );
});

describe("the calendar feed row", () => {
  it("asks for the link only when you press Subscribe", async () => {
    const user = renderSection();
    expect(screen.getByRole("heading", { name: "Calendar feed" })).toBeTruthy();
    expect(api.link).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(api.link).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("calendar_feed_created", {});
  });

  it("offers Apple, Google and a copy of the link", async () => {
    const user = renderSection();
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    const apple = await screen.findByRole("link", {
      name: "Add to Apple Calendar",
    });
    expect(apple.getAttribute("href")).toBe(
      `webcal://terpsicle.com/cal/${TOKEN}.ics`,
    );
    const google = screen.getByRole("link", { name: "Add to Google Calendar" });
    expect(google.getAttribute("href")).toBe(
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://terpsicle.com/cal/${TOKEN}.ics`)}`,
    );
    expect(google.getAttribute("target")).toBe("_blank");
    expect(google.getAttribute("rel")).toContain("noreferrer");

    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await user.click(screen.getByRole("button", { name: "Copy the link" }));
    expect(writeText).toHaveBeenCalledWith(URL_1);
    expect(await screen.findByText("Copied your calendar link")).toBeTruthy();
  });

  it("doesn't count an existing link as a new one", async () => {
    api.link.mockResolvedValue({ url: URL_1, created: false });
    const user = renderSection();
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    await screen.findByRole("link", { name: "Add to Apple Calendar" });
    expect(track).not.toHaveBeenCalled();
  });

  it("makes a new link at once and says the old one stopped", async () => {
    const user = renderSection();
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    await user.click(
      await screen.findByRole("button", { name: "Make a new link" }),
    );
    expect(api.reset).toHaveBeenCalledOnce();
    expect((await screen.findByRole("status")).textContent).toContain(
      "The old one stopped working",
    );
    expect(
      screen
        .getByRole("link", { name: "Add to Apple Calendar" })
        .getAttribute("href"),
    ).toBe(`webcal://terpsicle.com/cal/${"b".repeat(64)}.ics`);
    expect(track).toHaveBeenCalledWith("calendar_feed_reset", {});
    // Analytics never carry the link.
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toContain(TOKEN);
  });

  it("keeps the old link when a new one fails", async () => {
    api.reset.mockRejectedValue(new ApiCallError("network"));
    const user = renderSection();
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    await user.click(
      await screen.findByRole("button", { name: "Make a new link" }),
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Your old one still works",
    );
    expect(
      screen
        .getByRole("link", { name: "Add to Apple Calendar" })
        .getAttribute("href"),
    ).toBe(`webcal://terpsicle.com/cal/${TOKEN}.ics`);
  });

  it("says what went wrong and tries again", async () => {
    api.link.mockRejectedValueOnce(new ApiCallError("network"));
    const user = renderSection();
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(
      await screen.findByText(/Couldn't get your calendar link/),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("link", { name: "Add to Apple Calendar" }),
    ).toBeTruthy();
  });

  it("gives every control a tooltip", async () => {
    const user = renderSection();
    await user.click(screen.getByRole("button", { name: "Subscribe" }));
    await screen.findByRole("link", { name: "Add to Apple Calendar" });
    const controls = [
      ...screen.getAllByRole("link"),
      ...screen.getAllByRole("button"),
    ];
    for (const control of controls)
      expect(control.hasAttribute("data-tooltip"), control.textContent).toBe(
        true,
      );
  });
});
