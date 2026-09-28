import { create } from "zustand";
import type {
  MyReview,
  ReportCreateInput,
  ReportCreateResult,
  ReviewEditInput,
  ReviewId,
  ReviewSubmitInput,
  ReviewWriteResult,
} from "~/core/schema";
import { api } from "~/server/fns/api";

// Terpsicle's own reviews in the browser: your reviews (reviews/mine), and
// writing, deleting and reporting. What a page lists comes from its route's
// loader (page-data.ts), rendered on the server; `changes` counts what you
// changed here, so the page can load its reviews again.

export type MineState =
  | { status: "idle" | "loading" | "error" }
  | { status: "ready"; reviews: MyReview[] };

export type ReviewsClient = Pick<typeof api, "reviews" | "reports">;

let client: ReviewsClient = api;

/** Test hook: a fake API client. */
export function setReviewsClient(next: ReviewsClient): void {
  client = next;
}

/** The API client (or the tests' fake), for loaders outside the store. */
export function reviewsClient(): ReviewsClient {
  return client;
}

export interface ReviewsState {
  mine: MineState;
  /** Goes up after each write or delete: the page's reviews are out of date. */
  changes: number;
  /** Deleted here, waiting out the Undo toast before the server hears. */
  deleting: Readonly<Record<ReviewId, true>>;
  /** Reported from this page: shown folded, with thanks. */
  reported: Readonly<Record<ReviewId, true>>;

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
    input: Omit<Extract<ReportCreateInput, { surface: "review" }>, "surface">,
  ) => Promise<ReportCreateResult>;
}

const without = <T>(
  record: Readonly<Record<string, T>>,
  key: string,
): Record<string, T> => {
  const { [key]: _, ...rest } = record;
  return rest;
};

export const useReviews = create<ReviewsState>()((set, get) => {
  /** A write changed what you see: refresh your reviews, and the page's. */
  const afterWrite = async (reviewId: ReviewId | null) => {
    if (reviewId === null) return;
    await get().loadMine();
    set((s) => ({ changes: s.changes + 1 }));
  };

  return {
    mine: { status: "idle" },
    changes: 0,
    deleting: {},
    reported: {},

    loadMine: async () => {
      // A first load, or Try again after one failed: show it loading.
      const { status } = get().mine;
      if (status === "idle" || status === "error")
        set({ mine: { status: "loading" } });
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
        changes: s.changes + 1,
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
    mine: { status: "idle" },
    changes: 0,
    deleting: {},
    reported: {},
  });
}
