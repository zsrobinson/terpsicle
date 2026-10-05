import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminGrades } from "~/core/schema/admin";
import { ApiCallError } from "~/server/fns/api";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { type GradesClient, GradesPage } from "./grades-page";

const GRADES: AdminGrades = {
  gradesThrough: "202501",
  missing: [
    { termId: "202508", sentOn: "2026-02-01", note: "Reference PIA-12" },
    { termId: "202601", sentOn: null, note: "" },
  ],
};

function renderPage(grades = vi.fn(async (): Promise<AdminGrades> => GRADES)) {
  const client = {
    grades,
    gradesSave: vi.fn(async (input: AdminGrades["missing"][number]) => ({
      saved: input,
    })),
  };
  // The page header links between admin's pages, so it needs a router.
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <>
          <GradesPage client={client as unknown as GradesClient} />
          <Toaster />
        </>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/admin/grades"] }),
  });
  render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  return client;
}

describe("the Grade data page", () => {
  it("lists the semesters to ask for, and the words to ask with", async () => {
    renderPage();
    expect(
      await screen.findByText("PlanetTerp's grades run through Spring 2025"),
    ).toBeInTheDocument();
    expect(screen.getByText("Asked on 2026-02-01")).toBeInTheDocument();
    expect(screen.getByText("Not asked yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Public Information Act request: grade distributions, Fall 2025 and Spring 2026/,
      ),
    ).toBeInTheDocument();
    expect(
      (screen.getByLabelText("The request") as HTMLTextAreaElement).value,
    ).toContain("for Fall 2025 and Spring 2026.");
    expect(screen.getByRole("link", { name: /Open in email/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/^mailto:PublicInformationAct@umd\.edu\?subject=/),
    );
  });

  it("notes when a request went out", async () => {
    const client = renderPage();
    const user = userEvent.setup();
    const spring = (await screen.findByText("Spring 2026")).closest("li");
    if (!spring) throw new Error("no Spring 2026 row");
    const save = within(spring).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await user.type(within(spring).getByLabelText("Note"), "Sent by email");
    await user.click(save);
    await waitFor(() =>
      expect(client.gradesSave).toHaveBeenCalledWith({
        termId: "202601",
        sentOn: null,
        note: "Sent by email",
      }),
    );
    // It reads the list again, so the row shows what's stored.
    await waitFor(() => expect(client.grades).toHaveBeenCalledTimes(2));
  });

  it("says why the semesters didn't load, and Try again loads them", async () => {
    const grades = vi
      .fn(async (): Promise<AdminGrades> => GRADES)
      .mockRejectedValueOnce(new ApiCallError("rate-limited"));
    renderPage(grades);
    const user = userEvent.setup();
    expect(
      await screen.findByText(
        "Couldn't load the semesters. That's a lot of requests. Wait a minute, then try again.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Spring 2026")).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load the semesters/)).toBeNull();
  });
});
