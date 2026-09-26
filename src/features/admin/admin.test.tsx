import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminHealth,
  DecisionEntry,
  DecisionListResult,
  MeUser,
  QueueItem,
  ResolveResult,
} from "~/core/schema";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { api } from "~/server/fns/api";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { AdminGate } from "./admin-gate";
import { type DecisionsClient, DecisionsPage } from "./decisions-page";
import { type AdminClient, QueuePage } from "./queue-page";

const NOW = new Date("2027-01-10T12:00:00.000Z");
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

const ADMIN: MeUser = {
  id: "tadmin",
  name: "Test Admin",
  email: "tadmin@terpmail.umd.edu",
  avatarUrl: null,
  isAdmin: true,
  createdAt: "2026-10-01T15:00:00.000Z",
};

const wrap = (node: ReactNode) =>
  render(
    <TooltipProvider delayDuration={0}>
      {node}
      <Toaster />
    </TooltipProvider>,
  );

function signedInAs(user: MeUser | null, testMode = false) {
  useAccount.setState({
    status: user ? "signed-in" : "signed-out",
    flags: { ...FLAGS_OFF, signIn: true, authTestMode: testMode },
    user,
    deleteAfter: null,
  });
}

const anItem = (over: Partial<QueueItem> = {}): QueueItem => ({
  id: "AAAAAAAAAAAAAAAAAAAAAA",
  kind: "review",
  targetId: "review-1",
  course: "CMSC351",
  text: "Great class. Email the TA at ta@example.com if your grade is wrong.",
  reasons: [
    { code: "email", source: "rules", action: "hold", span: [29, 43] },
    { code: "personal-info", source: "policy", action: "hold", score: 0.74 },
  ],
  scores: { "personal-info": 0.74, spam: 0.01 },
  urgent: false,
  status: "open",
  createdAt: minutesAgo(180),
  closedAt: null,
  resolution: null,
  ...over,
});

const HEALTH: AdminHealth = {
  aiCalls: { today: 132, cap: 2000 },
  retry: { waiting: 1, oldestAt: minutesAgo(4) },
  queue: { open: 2, urgent: 1, oldestAt: minutesAgo(180) },
};

function fakeClient(items: QueueItem[], over: Partial<AdminClient> = {}) {
  const closed = items.map((i) => ({
    ...i,
    status: "closed" as const,
    closedAt: NOW.toISOString(),
  }));
  return {
    health: vi.fn(async () => HEALTH),
    queue: vi.fn(async (input: { status?: "open" | "closed" }) => ({
      items: input.status === "closed" ? closed : items,
      open: items.length,
    })),
    resolve: vi.fn(
      async (input: { id: string }): Promise<ResolveResult> => ({
        status: "ok",
        item: { ...closed[0], id: input.id } as QueueItem,
      }),
    ),
    undo: vi.fn(
      async (): Promise<ResolveResult> => ({
        status: "ok",
        item: items[0] as QueueItem,
      }),
    ),
    samples: vi.fn(async () => ({ items })),
    ...over,
  } satisfies AdminClient;
}

beforeEach(() => signedInAs(ADMIN));

describe("the admin gate", () => {
  it("shows the panel only to an admin", () => {
    wrap(<AdminGate>the panel</AdminGate>);
    expect(screen.getByText("the panel")).toBeInTheDocument();
  });

  it("is the plain not-found page for anyone else signed in", async () => {
    signedInAs({ ...ADMIN, id: "tstudent", isAdmin: false });
    // The not-found page links home, so it needs a router around it.
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => <AdminGate>the panel</AdminGate>,
      }),
      history: createMemoryHistory({ initialEntries: ["/admin"] }),
    });
    wrap(<RouterProvider router={router} />);
    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("the panel")).toBeNull();
  });

  it("sends a signed-out visitor to sign in, and back here afterwards", () => {
    signedInAs(null);
    window.history.replaceState(null, "", "/admin/decisions?stage=human");
    const redirect = vi.fn();
    wrap(<AdminGate redirect={redirect}>the panel</AdminGate>);
    expect(redirect).toHaveBeenCalledWith(
      "/signin?return=%2Fadmin%2Fdecisions%3Fstage%3Dhuman",
    );
    expect(screen.queryByText("the panel")).toBeNull();
  });
});

describe("the queue", () => {
  it("shows the health numbers, each held post, and why it was held", async () => {
    const client = fakeClient([
      anItem({
        id: "BBBBBBBBBBBBBBBBBBBBBB",
        kind: "chat",
        course: "CMSC131",
        text: "flip a table",
        reasons: [
          { code: "violence", source: "guard", action: "hold", category: "S1" },
        ],
        scores: {},
        urgent: true,
      }),
      anItem(),
    ]);
    wrap(
      <QueuePage
        view="waiting"
        onView={() => {}}
        client={client}
        now={() => NOW}
      />,
    );
    const health = await screen.findByRole("region", { name: "Health" });
    expect(await within(health).findByText("132 of 2,000")).toBeVisible();
    expect(within(health).getByText("7% used")).toBeVisible();
    expect(within(health).getByText("Oldest 4 min")).toBeVisible();
    expect(within(health).getByText("1 urgent, oldest 3 h")).toBeVisible();

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(2);
    const [urgent, review] = cards as [HTMLElement, HTMLElement];
    expect(within(urgent).getByText("Urgent")).toBeVisible();
    expect(within(urgent).getByText("Chat message in CMSC131")).toBeVisible();
    expect(within(urgent).getByText("Violence or a threat")).toBeVisible();
    expect(within(urgent).getByRole("button", { name: /Allow/ })).toBeVisible();

    expect(within(review).getByText("Review in CMSC351")).toBeVisible();
    expect(within(review).getByText("waiting 3 h")).toBeVisible();
    // The words the rule matched are marked.
    expect(review.querySelector("mark")?.textContent).toBe("ta@example.com");
    expect(within(review).getByText("An email address")).toBeVisible();
    expect(within(review).getByText(/policy check, 74%/)).toBeVisible();
    expect(
      within(review).getByText("Policy check: personal info 74%"),
    ).toBeVisible();
    expect(
      within(review).getByRole("button", { name: /Publish/ }),
    ).toBeVisible();
  });

  it("publishes at once, then Undo in the toast puts it back", async () => {
    const client = fakeClient([anItem()]);
    const user = userEvent.setup();
    wrap(
      <QueuePage
        view="waiting"
        onView={() => {}}
        client={client}
        now={() => NOW}
      />,
    );
    await user.click(await screen.findByRole("button", { name: /Publish/ }));
    expect(client.resolve).toHaveBeenCalledWith({
      id: "AAAAAAAAAAAAAAAAAAAAAA",
      action: "approve",
      reason: "fine",
    });
    await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
    expect(await screen.findByText("Published")).toBeVisible();
    // No dialog asked first.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Undo/ }));
    expect(client.undo).toHaveBeenCalledWith({ id: "AAAAAAAAAAAAAAAAAAAAAA" });
    expect(await screen.findByText("Back in the queue")).toBeVisible();
    expect(await screen.findByRole("article")).toBeVisible();
  });

  it("removes with a reason, offering the one that fits first", async () => {
    const client = fakeClient([anItem()]);
    const user = userEvent.setup();
    wrap(
      <QueuePage
        view="waiting"
        onView={() => {}}
        client={client}
        now={() => NOW}
      />,
    );
    await user.click(await screen.findByRole("button", { name: /Remove/ }));
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("Personal info");
    await user.click(
      within(menu).getByRole("menuitem", { name: "Spam or an ad" }),
    );
    expect(client.resolve).toHaveBeenCalledWith({
      id: "AAAAAAAAAAAAAAAAAAAAAA",
      action: "remove",
      reason: "spam",
    });
    expect(await screen.findByText("Removed: Spam or an ad")).toBeVisible();
  });

  it("lists what was just decided under Decided", async () => {
    const client = fakeClient([anItem()]);
    const user = userEvent.setup();
    const page = (view: "waiting" | "decided") => (
      <TooltipProvider delayDuration={0}>
        <QueuePage
          view={view}
          onView={() => {}}
          client={client}
          now={() => NOW}
        />
      </TooltipProvider>
    );
    const { rerender } = render(page("waiting"));
    await user.click(await screen.findByRole("button", { name: /Publish/ }));
    await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
    rerender(page("decided"));
    expect(await screen.findByRole("article")).toBeVisible();
  });

  it("says so plainly when an action fails, and keeps the post", async () => {
    const client = fakeClient([anItem()], {
      resolve: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const user = userEvent.setup();
    wrap(
      <QueuePage
        view="waiting"
        onView={() => {}}
        client={client}
        now={() => NOW}
      />,
    );
    await user.click(await screen.findByRole("button", { name: /Publish/ }));
    expect(await screen.findByText("Couldn't publish that")).toBeVisible();
    expect(screen.getByRole("article")).toBeVisible();
  });

  it("lists recent decisions, each with its own Undo", async () => {
    const decided = anItem({
      status: "closed",
      closedAt: minutesAgo(30),
      resolution: { decision: "remove", reason: "personal-info" },
    });
    const client = fakeClient([], {
      queue: vi.fn(async () => ({ items: [decided], open: 0 })),
    });
    const user = userEvent.setup();
    const onView = vi.fn();
    wrap(
      <QueuePage
        view="decided"
        onView={onView}
        client={client}
        now={() => NOW}
      />,
    );
    expect(client.queue).toHaveBeenCalledWith(
      { status: "closed", limit: 50 },
      expect.anything(),
    );
    const card = await screen.findByRole("article");
    expect(within(card).getByText("Removed: Personal info")).toBeVisible();
    expect(within(card).getByText("decided 30 min ago")).toBeVisible();
    await user.click(within(card).getByRole("button", { name: /Undo/ }));
    expect(client.undo).toHaveBeenCalledWith({ id: decided.id });

    await user.click(screen.getByRole("button", { name: /Waiting/ }));
    expect(onView).toHaveBeenCalledWith("waiting");
  });

  it("offers made-up posts only on test copies", async () => {
    const client = fakeClient([]);
    const { unmount } = wrap(
      <QueuePage view="waiting" onView={() => {}} client={client} />,
    );
    expect(await screen.findByText(/Nothing's waiting/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add test posts" })).toBeNull();
    unmount();

    signedInAs(ADMIN, true);
    const user = userEvent.setup();
    wrap(<QueuePage view="waiting" onView={() => {}} client={client} />);
    await user.click(
      await screen.findByRole("button", { name: "Add test posts" }),
    );
    expect(client.samples).toHaveBeenCalled();
  });

  it("never shows an author, even if one were sent", async () => {
    // The real client: its schema drops fields the panel doesn't know.
    const payload = {
      items: [
        {
          ...anItem(),
          author: "Secret Author",
          authorId: "sauthor",
          email: "sauthor@umd.edu",
        },
      ],
      open: 1,
    };
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client: AdminClient = {
      ...fakeClient([]),
      queue: (input, options) =>
        api.admin.queue(input, { ...options, fetcher }),
    };
    wrap(
      <QueuePage
        view="waiting"
        onView={() => {}}
        client={client}
        now={() => NOW}
      />,
    );
    await screen.findByRole("article");
    expect(document.body.textContent).not.toMatch(/Secret Author|sauthor/);
  });
});

const anEntry = (over: Partial<DecisionEntry> = {}): DecisionEntry => ({
  id: "CCCCCCCCCCCCCCCCCCCCCC",
  kind: "review",
  targetId: "review-9",
  stage: "model",
  verdict: "hold",
  decidedBy: "system",
  reasons: [{ code: "spam", source: "policy", action: "hold", score: 0.7 }],
  reason: null,
  latencyMs: 400,
  createdAt: minutesAgo(10),
  ...over,
});

const days = (): DecisionListResult["days"] => [
  { day: "2027-01-10", allowed: 18, held: 1, rejected: 1 },
  { day: "2027-01-09", allowed: 5, held: 2, rejected: 0 },
  { day: "2027-01-08", allowed: 0, held: 0, rejected: 0 },
];

describe("the decision log", () => {
  it("shows each day's held share against the target, and the log", async () => {
    const client = {
      decisions: vi.fn(async () => ({
        decisions: [
          anEntry(),
          anEntry({
            id: "DDDDDDDDDDDDDDDDDDDDDD",
            kind: "chat",
            stage: "human",
            verdict: "remove",
            decidedBy: "admin",
            reason: "personal-info",
            reasons: [],
          }),
        ],
        cursor: null,
        days: days(),
      })),
    } satisfies DecisionsClient;
    wrap(<DecisionsPage filters={{}} onFilters={() => {}} client={client} />);
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent(/Sun, Jan 10\s*18\s*1\s*1\s*5%/);
    expect(rows[2]).toHaveTextContent("29%");
    expect(rows[3]).toHaveTextContent("–");
    expect(
      screen.getByText(/11% held for you, against a target under 5%/),
    ).toBeVisible();

    const log = screen.getByRole("list", { name: "Decision log" });
    const entries = within(log).getAllByRole("listitem");
    expect(entries[0]).toHaveTextContent(/Held.*Review.*by automatic check/);
    expect(entries[0]).toHaveTextContent("Spam or an ad");
    expect(entries[1]).toHaveTextContent(/Removed.*Chat message.*by you/);
    expect(entries[1]).toHaveTextContent("Personal info");
    expect(screen.queryByRole("button", { name: "Show older" })).toBeNull();
  });

  it("filters through the URL, and pages with Show older", async () => {
    const client = {
      decisions: vi.fn(async (input: { cursor?: string }) => ({
        decisions: input.cursor
          ? [anEntry({ id: "EEEEEEEEEEEEEEEEEEEEEE", targetId: "older" })]
          : [anEntry()],
        cursor: input.cursor
          ? null
          : "2027-01-10T11:50:00.000Z~CCCCCCCCCCCCCCCCCCCCCC",
        days: days(),
      })),
    } satisfies DecisionsClient;
    const onFilters = vi.fn();
    const user = userEvent.setup();
    wrap(
      <DecisionsPage
        filters={{ surface: "chat" }}
        onFilters={onFilters}
        client={client}
      />,
    );
    expect(client.decisions).toHaveBeenCalledWith(
      { surface: "chat", stage: undefined, verdict: undefined, limit: 50 },
      expect.anything(),
    );
    await user.click(await screen.findByRole("button", { name: "Show older" }));
    expect(await screen.findByText("older")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show older" })).toBeNull();

    await user.click(screen.getByRole("combobox", { name: "Stage" }));
    await user.click(await screen.findByRole("option", { name: "You" }));
    expect(onFilters).toHaveBeenCalledWith({ surface: "chat", stage: "human" });
  });
});
