// Rendering helpers for Reviews' UI tests. Not used by the app.
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { type RenderResult, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import type { Flags, MeResult, MeUser } from "~/core/schema";
import {
  type AccountClient,
  FLAGS_OFF,
  setAccountClient,
  useAccount,
} from "~/features/auth/account-store";
import { createMemoryDataSource } from "~/state/data-source";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { setReviewsDataSource } from "./data";
import {
  type ReviewsClient,
  resetReviews,
  setReviewsClient,
} from "./reviews-store";

export const STUDENT: MeUser = {
  id: "tstudent",
  name: "Test Student",
  email: "tstudent@terpmail.umd.edu",
  avatarUrl: null,
  isAdmin: false,
  createdAt: "2026-10-01T15:00:00.000Z",
};

/** Who's reading, and REVIEWS_ENABLED, as /api/me would say. */
export function setAccount({
  reviews,
  user = null,
}: {
  reviews: Flags["reviews"];
  user?: MeUser | null;
}): void {
  const flags: Flags = { ...FLAGS_OFF, signIn: true, reviews };
  const me: MeResult = user
    ? { status: "signed-in", flags, user, pushPublicKey: null }
    : { status: "signed-out", flags };
  setAccountClient({ me: async () => me } as unknown as AccountClient);
  useAccount.setState({
    status: user ? "signed-in" : "signed-out",
    flags,
    user,
  });
}

/** A fake reviews API: every call is a spy; `lists` answers reviews/list. */
export function fakeReviewsClient(
  overrides: {
    list?: ReviewsClient["reviews"]["list"];
    mine?: ReviewsClient["reviews"]["mine"];
    submit?: ReviewsClient["reviews"]["submit"];
    edit?: ReviewsClient["reviews"]["edit"];
    remove?: ReviewsClient["reviews"]["delete"];
    report?: ReviewsClient["reports"]["create"];
  } = {},
) {
  const client = {
    reviews: {
      list: vi.fn(
        overrides.list ?? (async () => ({ reviews: [], next: null })),
      ),
      mine: vi.fn(overrides.mine ?? (async () => ({ reviews: [] }))),
      submit: vi.fn(
        overrides.submit ??
          (async () => ({
            status: "published" as const,
            reviewId: "rvPublicReview00000001",
          })),
      ),
      edit: vi.fn(
        overrides.edit ??
          (async () => ({
            status: "published" as const,
            reviewId: "rvPublicReview00000001",
          })),
      ),
      delete: vi.fn(
        overrides.remove ?? (async () => ({ status: "deleted" as const })),
      ),
    },
    reports: {
      create: vi.fn(
        overrides.report ?? (async () => ({ status: "reported" as const })),
      ),
    },
  };
  setReviewsClient(client as unknown as ReviewsClient);
  return client;
}

/** Published files the pages read, by DATA.md key (build them with the fixtures). */
export function publishFiles(files: Readonly<Record<string, unknown>>): void {
  setReviewsDataSource(createMemoryDataSource(files));
}

/** Starts each test from nothing loaded. */
export function resetReviewsUi(): void {
  resetReviews();
  setReviewsDataSource(null);
}

/** Renders `ui` at `path` in a router (Links need one), with tooltips and toasts. */
export async function renderPage(
  ui: ReactNode,
  path = "/reviews",
): Promise<RenderResult> {
  const root = createRootRoute({
    component: () => (
      <TooltipProvider delayDuration={0}>
        <Outlet />
        <Toaster />
      </TooltipProvider>
    ),
  });
  const page = createRoute({
    getParentRoute: () => root,
    path: "$",
    component: () => ui,
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return render(<RouterProvider router={router} />);
}
