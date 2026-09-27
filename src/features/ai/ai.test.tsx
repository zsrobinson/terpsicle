import "fake-indexeddb/auto";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { PREFS_STORAGE_KEY } from "~/core/prefs";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { forgetReviewSummaries } from "~/features/course-details/use-review-summary";
import { prefsDb } from "~/features/prefs/save";
import {
  resetSyncedPrefsForTests,
  showSyncedPrefs,
} from "~/features/prefs/synced-prefs";
import { SummaryBlock } from "~/features/reviews/planetterp-blocks";
import { aReviewSummary } from "~/fixtures";
import { api } from "~/server/fns/api";
import { Toaster } from "~/ui/sonner";
import { dismissToast } from "~/ui/toast";
import { TooltipProvider } from "~/ui/tooltip";
import { AI_TOAST_ID } from "./ai-menu";
import { AiSettingsSection } from "./ai-settings-section";
import { AiSparkles } from "./ai-sparkles";

// "Show AI summaries" (docs/decisions.md, "AI features can be turned off"):
// the AI box's ⋯ menu with Undo, the Settings switch, and nothing asked of a
// model while it's off.

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));
vi.mock("~/server/fns/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/fns/api")>();
  return { ...actual, api: { ...actual.api, reviewSummary: vi.fn() } };
});

const wrap = (node: ReactNode) =>
  render(
    <TooltipProvider delayDuration={0}>
      {node}
      <Toaster />
    </TooltipProvider>,
  );

const summaries = () => screen.queryAllByRole("img", { name: "AI summary" });

/** What this device's `prefs` row holds. */
const devicePrefs = async () => (await prefsDb().settings.get("prefs"))?.value;

beforeEach(async () => {
  localStorage.clear();
  resetSyncedPrefsForTests();
  forgetReviewSummaries();
  await prefsDb().settings.clear();
  useAccount.setState({ status: "signed-out", user: null, flags: FLAGS_OFF });
  vi.mocked(track).mockClear();
  vi.mocked(api.reviewSummary).mockReset();
  vi.mocked(api.reviewSummary).mockImplementation(async ({ slug }) => ({
    status: "ok",
    summary: aReviewSummary({ slug }),
  }));
});

afterEach(() => {
  dismissToast(AI_TOAST_ID);
});

describe("the AI summary box", () => {
  it("hides every AI summary from its ⋯ menu, with Undo", async () => {
    const user = userEvent.setup();
    wrap(
      <>
        <SummaryBlock slug="ashdown_keiko" course="CMSC351" />
        <SummaryBlock slug="abernathy_jada" course="CMSC351" />
      </>,
    );
    await waitFor(() => expect(summaries()).toHaveLength(2));

    const [menu] = screen.getAllByRole("button", {
      name: "AI summary options",
    });
    if (!menu) throw new Error("no ⋯ menu");
    await user.click(menu);
    await user.click(
      await screen.findByRole("menuitem", { name: /Hide AI summaries/ }),
    );
    expect(summaries()).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "AI summary options" }),
    ).toBeNull();
    expect(track).toHaveBeenCalledWith("ai_features_changed", {
      on: false,
      via: "box",
    });
    expect(await screen.findByText("AI summaries are off")).toBeVisible();
    expect(screen.getByText("Turn them back on in Settings.")).toBeVisible();
    await waitFor(async () =>
      expect(await devicePrefs()).toEqual({ ai: { features: false } }),
    );

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(summaries()).toHaveLength(2));
    expect(track).toHaveBeenLastCalledWith("ai_features_changed", {
      on: true,
      via: "box",
    });
    await waitFor(async () =>
      expect(await devicePrefs()).toEqual({ ai: { features: true } }),
    );
  });

  it("asks no model for anything while AI features are off", async () => {
    showSyncedPrefs({ ai: { features: false } });
    wrap(<SummaryBlock slug="ashdown_keiko" course="CMSC351" />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(api.reviewSummary).not.toHaveBeenCalled();
    // Nothing where the box was: no summary, no loading, no menu.
    expect(summaries()).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "AI summary options" }),
    ).toBeNull();
  });

  it("follows a change made in another tab", async () => {
    wrap(<SummaryBlock slug="ashdown_keiko" course="CMSC351" />);
    await waitFor(() => expect(summaries()).toHaveLength(1));
    const off = JSON.stringify({ ai: { features: false } });
    act(() => {
      localStorage.setItem(PREFS_STORAGE_KEY, off);
      window.dispatchEvent(
        new StorageEvent("storage", { key: PREFS_STORAGE_KEY, newValue: off }),
      );
    });
    expect(summaries()).toHaveLength(0);
  });
});

describe("the sparkles", () => {
  it("show only while AI features are on", () => {
    wrap(<AiSparkles aria-label="AI" role="img" />);
    expect(screen.getByRole("img", { name: "AI" })).toBeInTheDocument();
    act(() => showSyncedPrefs({ ai: { features: false } }));
    expect(screen.queryByRole("img", { name: "AI" })).toBeNull();
  });
});

describe("Settings → AI features", () => {
  it("turns AI summaries off and on, signed out, in this browser", async () => {
    const user = userEvent.setup();
    wrap(
      <>
        <AiSettingsSection />
        <SummaryBlock slug="ashdown_keiko" course="CMSC351" />
      </>,
    );
    const section = screen
      .getByRole("heading", { name: "AI features" })
      .closest("section") as HTMLElement;
    expect(within(section).getByText("Saved in this browser")).toBeVisible();
    const toggle = within(section).getByRole("switch", {
      name: "Show AI summaries",
    });
    expect(toggle).toBeChecked();
    await waitFor(() => expect(summaries()).toHaveLength(1));

    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(summaries()).toHaveLength(0);
    expect(track).toHaveBeenCalledWith("ai_features_changed", {
      on: false,
      via: "settings",
    });
    await waitFor(async () =>
      expect(await devicePrefs()).toEqual({ ai: { features: false } }),
    );
    expect(JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? "{}")).toEqual(
      { ai: { features: false } },
    );

    await user.click(toggle);
    expect(toggle).toBeChecked();
    await waitFor(() => expect(summaries()).toHaveLength(1));
  });

  it("reads this device's choice, even when the page's copy is gone", async () => {
    await prefsDb().settings.put({
      key: "prefs",
      value: { ai: { features: false } },
    });
    wrap(<AiSettingsSection />);
    const toggle = screen.getByRole("switch", { name: "Show AI summaries" });
    await waitFor(() => expect(toggle).not.toBeChecked());
  });
});
