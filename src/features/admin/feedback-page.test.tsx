import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FeedbackItem, FeedbackListResult } from "~/core/schema/feedback";
import { aFeedback } from "~/fixtures";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import {
  type FeedbackClient,
  type FeedbackFilters,
  FeedbackPage,
  feedbackRows,
} from "./feedback-page";

const ORIGIN = "https://terpsicle.com";

function aList(
  overrides: Partial<FeedbackListResult> = {},
): FeedbackListResult {
  return {
    items: [aFeedback()],
    cursor: null,
    groups: [],
    hosts: ["terpsicle.com"],
    newCount: 1,
    ...overrides,
  };
}

function aClient(list: FeedbackListResult = aList()) {
  const client = {
    feedbackList: vi.fn(async () => list),
    feedbackUpdate: vi.fn(
      async (input: {
        id: string;
        status?: FeedbackItem["status"];
        note?: string | null;
      }) => ({
        status: "updated" as const,
        item: {
          ...(list.items.find((i) => i.id === input.id) ?? aFeedback()),
          ...(input.status ? { status: input.status } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        },
        emailed: input.status === "fixed",
      }),
    ),
    feedbackDelete: vi.fn(async (input: { restore?: boolean }) => ({
      status: input.restore ? ("restored" as const) : ("deleted" as const),
    })),
    feedbackGroup: vi.fn(async () => ({
      status: "grouped" as const,
      groups: 1,
      grouped: 2,
    })),
  };
  return client;
}

function renderPage(
  client: ReturnType<typeof aClient>,
  filters: FeedbackFilters = {},
) {
  const onFilters = vi.fn();
  // The page header links between admin's pages, so it needs a router.
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <>
          <FeedbackPage
            filters={filters}
            onFilters={onFilters}
            client={client as unknown as FeedbackClient}
            origin={ORIGIN}
          />
          <Toaster />
        </>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/admin/feedback"] }),
  });
  render(
    <TooltipProvider delayDuration={0}>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
  return { onFilters, user: userEvent.setup() };
}

afterEach(() => vi.restoreAllMocks());

describe("feedbackRows", () => {
  it("puts a group where its newest item is, and ones alone as items", () => {
    const g = {
      id: "G".repeat(22),
      summary: "Blank map",
      updatedAt: "2026-09-25T12:00:00.000Z",
    };
    const a = aFeedback({ id: "A".repeat(22), groupId: g.id });
    const b = aFeedback({ id: "B".repeat(22) });
    const c = aFeedback({ id: "C".repeat(22), groupId: g.id });
    const lone = aFeedback({ id: "D".repeat(22), groupId: "H".repeat(22) });
    const rows = feedbackRows([a, b, c, lone], new Map([[g.id, g]]));
    expect(
      rows.map((r) => (r.type === "item" ? r.item.id : r.group.id)),
    ).toEqual([g.id, b.id, lone.id]);
    expect(rows[0]).toMatchObject({ items: [a, c] });
  });
});

describe("the feedback inbox", () => {
  it("shows the words, the context, screenshots and recent actions", async () => {
    const client = aClient();
    renderPage(client);
    const item = await screen.findByRole("article", { name: "Bug, New" });
    expect(
      within(item).getByText(
        "The route map stays blank after I pick a section.",
      ),
    ).toBeInTheDocument();
    expect(within(item).getByText(/A walking route/)).toBeInTheDocument();
    expect(
      within(item).getByText(/Schedule · \/schedule\?tab=travel · Chrome 141/),
    ).toBeInTheDocument();
    expect(
      within(item).getByRole("img", { name: "The page's screenshot" }),
    ).toHaveAttribute(
      "src",
      `${ORIGIN}/admin/feedback/shot/FBAAAAAAAAAAAAAAAAAAAA`,
    );
    expect(within(item).getByText("Recent actions (3)")).toBeInTheDocument();
    expect(screen.getByText("1 new")).toBeInTheDocument();
  });

  it("filters through the URL", async () => {
    const client = aClient();
    const { onFilters, user } = renderPage(client, { status: "new" });
    await screen.findByRole("article");
    expect(client.feedbackList).toHaveBeenCalledWith(
      expect.objectContaining({ status: "new", limit: 50 }),
      expect.anything(),
    );
    await user.click(screen.getByRole("combobox", { name: "Kind" }));
    await user.click(
      await screen.findByRole("option", { name: "Pinned notes" }),
    );
    expect(onFilters).toHaveBeenCalledWith({
      status: "new",
      kind: "review",
      item: undefined,
    });
  });

  it("marks Fixed at once, says it emailed them, and Undo puts it back", async () => {
    const client = aClient(aList({ items: [aFeedback({ reply: true })] }));
    const { user } = renderPage(client);
    const item = await screen.findByRole("article");
    expect(within(item).getByText("Wants a reply")).toBeInTheDocument();
    const status = within(item).getByRole("radiogroup", { name: "Status" });
    expect(within(status).getByRole("radio", { name: "New" })).toBeChecked();
    await user.click(within(status).getByRole("radio", { name: "Fixed" }));
    expect(client.feedbackUpdate).toHaveBeenCalledWith({
      id: "FBAAAAAAAAAAAAAAAAAAAA",
      status: "fixed",
    });
    expect(await screen.findByText("Marked Fixed")).toBeInTheDocument();
    expect(
      screen.getByText("We emailed them that it's fixed."),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("article", { name: "Bug, Fixed" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(client.feedbackUpdate).toHaveBeenLastCalledWith({
        id: "FBAAAAAAAAAAAAAAAAAAAA",
        status: "new",
      }),
    );
  });

  it("deletes with Undo, never a dialog", async () => {
    const client = aClient();
    const { user } = renderPage(client);
    const item = await screen.findByRole("article");
    await user.click(within(item).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("article")).toBeInTheDocument();
    expect(client.feedbackDelete).toHaveBeenLastCalledWith({
      id: "FBAAAAAAAAAAAAAAAAAAAA",
      restore: true,
    });
  });

  it("saves a note when you click away", async () => {
    const client = aClient();
    const { user } = renderPage(client);
    await screen.findByRole("article");
    await user.type(screen.getByLabelText("Your note"), "Seen on Safari too");
    await user.tab();
    await waitFor(() =>
      expect(client.feedbackUpdate).toHaveBeenCalledWith({
        id: "FBAAAAAAAAAAAAAAAAAAAA",
        note: "Seen on Safari too",
      }),
    );
    expect(await screen.findByText("Note saved")).toBeInTheDocument();
  });

  it("copies Markdown for an agent", async () => {
    const client = aClient();
    const { user } = renderPage(client);
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    await user.click(
      await screen.findByRole("button", { name: "Copy for an agent" }),
    );
    expect(writeText.mock.calls[0]?.[0]).toContain("## Bug in Schedule (New)");
    expect(writeText.mock.calls[0]?.[0]).toContain(
      `${ORIGIN}/admin/feedback?item=FBAAAAAAAAAAAAAAAAAAAA`,
    );
    expect(await screen.findByText("Copied for an agent")).toBeInTheDocument();
  });

  it("links a GitHub issue that carries none of their words", async () => {
    renderPage(aClient());
    const link = await screen.findByRole("link", { name: "Open GitHub issue" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toMatch(
      /^https:\/\/github\.com\/zsrobinson\/terpsicle\/issues\/new\?/,
    );
    expect(decodeURIComponent(href)).not.toContain("route map stays blank");
  });

  it("groups similar items under the model's summary, with the sparkles", async () => {
    const g = {
      id: "G".repeat(22),
      summary: "Route map stays blank",
      updatedAt: "2026-09-25T12:00:00.000Z",
    };
    const client = aClient(
      aList({
        items: [
          aFeedback({ id: "A".repeat(22), groupId: g.id }),
          aFeedback({ id: "B".repeat(22), groupId: g.id }),
        ],
        groups: [g],
      }),
    );
    const { user } = renderPage(client);
    const group = await screen.findByRole("region", {
      name: "Group: Route map stays blank",
    });
    expect(
      within(group).getByLabelText("Summary written by AI"),
    ).toBeInTheDocument();
    expect(within(group).getAllByRole("article")).toHaveLength(2);
    await user.click(
      within(group).getByRole("button", { name: /Route map stays blank/ }),
    );
    expect(within(group).queryAllByRole("article")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Group similar" }));
    expect(client.feedbackGroup).toHaveBeenCalled();
    expect(await screen.findByText("2 items in 1 group")).toBeInTheDocument();
  });

  it("shows one item for a link back to it", async () => {
    const client = aClient();
    renderPage(client, { item: "FBAAAAAAAAAAAAAAAAAAAA", status: "fixed" });
    await screen.findByRole("article");
    expect(client.feedbackList).toHaveBeenCalledWith(
      { id: "FBAAAAAAAAAAAAAAAAAAAA", limit: 50 },
      expect.anything(),
    );
    expect(
      screen.getByRole("button", { name: "Show everything" }),
    ).toBeInTheDocument();
  });
});
