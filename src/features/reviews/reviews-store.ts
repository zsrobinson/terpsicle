import { create } from "zustand";
import type {
  InstructorId,
  MyReview,
  PublicReview,
  ReportCreateInput,
  ReportCreateResult,
  ReviewEditInput,
  ReviewId,
  ReviewSubmitInput,
  ReviewWriteResult,
} from "~/core/schema";
import { ApiCallError, api } from "~/server/fns/api";

// Terpsicle's own reviews in the browser: each instructor's published list
// (reviews/list, anonymous), your reviews (reviews/mine), and writing,
// deleting and reporting. PlanetTerp's numbers come from ./data.ts.

/**
 * Pages of reviews/list read per instructor. Their count and mean feed the
 * combined rating until the reviews/ R2 family publishes our numbers
 * (V2 §7.6, v2/reviews-publish); past this, the newest are shown and counted.
 */
export const MAX_LIST_PAGES = 10;

export type ListState =
  | { status: "loading" }
  | { status: "ready"; reviews: PublicReview[]; complete: boolean }
  /** REVIEWS_ENABLED is off here: show PlanetTerp only. */
  | { status: "off" }
  | { status: "error" };

export type MineState =
  | { status: "idle" | "loading" | "error" }
  | { status: "ready"; reviews: MyReview[] };

export type ReviewsClient = Pick<typeof api, "reviews" | "reports">;

let client: ReviewsClient = api;

/** Test hook: a fake API client. */
export function setReviewsClient(next: ReviewsClient): void {
  client = next;
}

export interface ReviewsState {
  lists: Readonly<Record<InstructorId, ListState>>;
  mine: MineState;
  /** Deleted here, waiting out the Undo toast before the server hears. */
  deleting: Readonly<Record<ReviewId, true>>;
  /** Reported from this page: shown folded, with thanks. */
  reported: Readonly<Record<ReviewId, true>>;

  /** Loads an instructor's reviews once per visit. */
  ensureList: (id: InstructorId) => Promise<void>;
  /** Loads them again (after writing one). */
  reloadList: (id: InstructorId) => Promise<void>;
  loadMine: () => Promise<void>;
  submit: (input: ReviewSubmitInput) => Promise<ReviewWriteResult>;
  edit: (input: ReviewEditInput) => Promise<ReviewWriteResult>;
  /** Hides it here; `commitDelete` tells the server once Undo has passed. */
  startDelete: (id: ReviewId) => void;
  undoDelete: (id: ReviewId) => void;
  /** `keepalive`: the page is closing, so the request must outlive it. */
  commitDelete: (
    id: ReviewId,
    options?: { keepalive?: boolean },
  ) => Promise<boolean>;
  report: (
    input: Omit<ReportCreateInput, "surface">,
  ) => Promise<ReportCreateResult>;
}

async function readAll(id: InstructorId): Promise<ListState> {
  const reviews: PublicReview[] = [];
  let cursor: ReviewId | null = null;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const result = await client.reviews.list({
      instructorId: id,
      course: null,
      cursor,
      limit: 20,
    });
    reviews.push(...result.reviews);
    cursor = result.next;
    if (cursor === null) return { status: "ready", reviews, complete: true };
  }
  return { status: "ready", reviews, complete: false };
}

const offOrError = (error: unknown): ListState =>
  error instanceof ApiCallError && error.reason === "unavailable"
    ? { status: "off" }
    : { status: "error" };

const without = <T>(
  record: Readonly<Record<string, T>>,
  key: string,
): Record<string, T> => {
  const { [key]: _, ...rest } = record;
  return rest;
};

export const useReviews = create<ReviewsState>()((set, get) => {
  const load = async (id: InstructorId) => {
    set((s) => ({ lists: { ...s.lists, [id]: { status: "loading" } } }));
    let next: ListState;
    try {
      next = await readAll(id);
    } catch (error) {
      next = offOrError(error);
    }
    set((s) => ({ lists: { ...s.lists, [id]: next } }));
  };

  /** A write changed what you see: refresh your reviews, and its list. */
  const afterWrite = async (reviewId: ReviewId | null) => {
    if (reviewId === null) return;
    await get().loadMine();
    const mine = get().mine;
    const id =
      mine.status === "ready"
        ? mine.reviews.find((r) => r.id === reviewId)?.instructorId
        : undefined;
    if (id && get().lists[id]) await load(id);
  };

  return {
    lists: {},
    mine: { status: "idle" },
    deleting: {},
    reported: {},

    ensureList: async (id) => {
      const current = get().lists[id];
      if (current && current.status !== "error") return;
      await load(id);
    },

    reloadList: (id) => load(id),

    loadMine: async () => {
      if (get().mine.status === "idle") set({ mine: { status: "loading" } });
      try {
        const { reviews } = await client.reviews.mine();
        set({ mine: { status: "ready", reviews } });
      } catch {
        set({ mine: { status: "error" } });
      }
    },

    submit: async (input) => {
      const result = await client.reviews.submit(input);
      await afterWrite("reviewId" in result ? result.reviewId : null);
      return result;
    },

    edit: async (input) => {
      const result = await client.reviews.edit(input);
      await afterWrite("reviewId" in result ? result.reviewId : null);
      return result;
    },

    startDelete: (id) =>
      set((s) => ({ deleting: { ...s.deleting, [id]: true } })),

    undoDelete: (id) => set((s) => ({ deleting: without(s.deleting, id) })),

    commitDelete: async (id, { keepalive = false } = {}) => {
      if (!get().deleting[id]) return false;
      try {
        await client.reviews.delete(
          { reviewId: id },
          keepalive
            ? { fetcher: (url, init) => fetch(url, { ...init, keepalive }) }
            : undefined,
        );
      } catch {
        set((s) => ({ deleting: without(s.deleting, id) }));
        return false;
      }
      set((s) => ({
        deleting: without(s.deleting, id),
        lists: Object.fromEntries(
          Object.entries(s.lists).map(([key, list]) => [
            key,
            list.status === "ready"
              ? { ...list, reviews: list.reviews.filter((r) => r.id !== id) }
              : list,
          ]),
        ),
        mine:
          s.mine.status === "ready"
            ? {
                status: "ready",
                reviews: s.mine.reviews.filter((r) => r.id !== id),
              }
            : s.mine,
      }));
      return true;
    },

    report: async (input) => {
      const result = await client.reports.create({
        surface: "review",
        ...input,
      });
      if (result.status === "reported")
        set((s) => ({ reported: { ...s.reported, [input.ref]: true } }));
      return result;
    },
  };
});

/** Tests start from nothing loaded. */
export function resetReviews(): void {
  useReviews.setState({
    lists: {},
    mine: { status: "idle" },
    deleting: {},
    reported: {},
  });
}
