import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
import type {
  DecisionStage,
  ModerationKind,
  QueueListResult,
  StoredVerdict,
} from "~/core/schema";
import type {
  FeedbackItem,
  FeedbackKind,
  FeedbackListResult,
  FeedbackProduct,
  FeedbackStatus,
} from "~/core/schema/feedback";
import type { adminApi } from "~/server/fns/admin-api";
import { retryApi } from "~/server/fns/api";
import type { feedbackAdminApi } from "~/server/fns/feedback-admin-api";
import { failureWords } from "./words";

// The admin panel's server data as TanStack Query (V2 §10, docs/FEEDBACK.md;
// docs/decisions.md "TanStack Query for server data and its caching"). Each
// page's answer is a query keyed by what it asked: the grades, the health
// numbers, a queue view, the decision log and the feedback inbox for one
// filter (those two a page at a time). None is ever fresh: every visit, filter
// and return to the tab asks again, showing what it had for that same
// question meanwhile, never another filter's rows. Nothing is persisted, and
// a page load forgets it all (signing out leaves the page).
//
// Each factory takes the API it reads (pages pass theirs, tests a fake), so
// this module imports the clients' types only: the queue never loads the
// feedback schemas (./feedback-admin-api).

export const adminKeys = {
  all: ["admin"] as const,
  grades: ["admin", "grades"] as const,
  health: ["admin", "health"] as const,
  queues: ["admin", "queue"] as const,
  queue: (view: QueueView) => ["admin", "queue", view] as const,
  decisions: (filters: DecisionQuery) =>
    ["admin", "decisions", filters] as const,
  feedback: ["admin", "feedback"] as const,
  feedbackList: (query: FeedbackQuery) => ["admin", "feedback", query] as const,
};

/** Every admin answer is asked for again on each look. */
const shared = {
  staleTime: 0,
  retry: retryApi,
  // Offline, it says so (after `retryApi`'s tries) rather than waiting.
  networkMode: "always",
} as const;

type QueueView = "waiting" | "decided";

/** The semesters without grades (`/admin/grades`). */
export function gradesQuery(client: Pick<typeof adminApi, "grades">) {
  return queryOptions({
    queryKey: adminKeys.grades,
    queryFn: ({ signal }) => client.grades({ signal }),
    ...shared,
  });
}

/** The numbers over the queue. */
export function healthQuery(client: Pick<typeof adminApi, "health">) {
  return queryOptions({
    queryKey: adminKeys.health,
    queryFn: ({ signal }) => client.health({ signal }),
    ...shared,
  });
}

/** Waiting (open) or decided (lately closed) posts, 50 of them. */
export function queueQuery(
  client: Pick<typeof adminApi, "queue">,
  view: QueueView,
) {
  return queryOptions({
    queryKey: adminKeys.queue(view),
    queryFn: ({ signal }) =>
      client.queue(
        { status: view === "waiting" ? "open" : "closed", limit: 50 },
        { signal },
      ),
    ...shared,
  });
}

/** A waiting list without a post just decided, its count one less. */
export function withoutQueueItem(
  list: QueueListResult,
  id: string,
): QueueListResult {
  if (!list.items.some((i) => i.id === id)) return list;
  return {
    ...list,
    items: list.items.filter((i) => i.id !== id),
    open: Math.max(0, list.open - 1),
  };
}

export interface DecisionQuery {
  surface?: ModerationKind | undefined;
  stage?: DecisionStage | undefined;
  verdict?: StoredVerdict | undefined;
}

/** How many rows a page of the log or the inbox holds. */
export const ADMIN_PAGE = 50;

/** The decision log for one filter, newest first, a page at a time. */
export function decisionsQuery(
  client: Pick<typeof adminApi, "decisions">,
  filters: DecisionQuery,
) {
  return infiniteQueryOptions({
    queryKey: adminKeys.decisions(filters),
    queryFn: ({ pageParam, signal }) =>
      client.decisions(
        {
          ...filters,
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: ADMIN_PAGE,
        },
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
    ...shared,
  });
}

/** What the inbox asks for: one item, or the filters. */
export interface FeedbackQuery {
  id?: string | undefined;
  status?: FeedbackStatus | undefined;
  kind?: FeedbackKind | undefined;
  product?: FeedbackProduct | undefined;
  host?: string | undefined;
}

/** The feedback inbox for one filter, newest first, a page at a time. */
export function feedbackListQuery(
  client: Pick<typeof feedbackAdminApi, "feedbackList">,
  query: FeedbackQuery,
) {
  return infiniteQueryOptions({
    queryKey: adminKeys.feedbackList(query),
    queryFn: ({ pageParam, signal }) =>
      client.feedbackList(
        {
          ...query,
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: ADMIN_PAGE,
        },
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
    ...shared,
  });
}

type FeedbackPages = { pages: FeedbackListResult[]; pageParams: unknown[] };

/**
 * Before an edit: an answer on its way would land over it. Cancelling puts
 * each list back as it was before that fetch, there and then; lists still
 * loading for the first time carry on.
 */
function holdFeedback(client: QueryClient): void {
  void client.cancelQueries({
    queryKey: adminKeys.feedback,
    predicate: (query) => query.state.data !== undefined,
  });
}

/** Every inbox list with `item` as it is now, wherever it's listed. */
export function setFeedbackItem(client: QueryClient, item: FeedbackItem): void {
  holdFeedback(client);
  client.setQueriesData<FeedbackPages>(
    { queryKey: adminKeys.feedback },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((p) => ({
          ...p,
          items: p.items.map((i) => (i.id === item.id ? item : i)),
        })),
      },
  );
}

/** Every inbox list without the item `id` (deleted). */
export function dropFeedbackItem(client: QueryClient, id: string): void {
  holdFeedback(client);
  client.setQueriesData<FeedbackPages>(
    { queryKey: adminKeys.feedback },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((p) => ({
          ...p,
          items: p.items.filter((i) => i.id !== id),
        })),
      },
  );
}

/**
 * The list `query` with a deleted `item` put back (Undo), where its date
 * puts it, newest first. Older than everything loaded, it's on a page not
 * asked for yet, unless the last page is loaded.
 */
export function restoreFeedbackItem(
  client: QueryClient,
  query: FeedbackQuery,
  item: FeedbackItem,
): void {
  holdFeedback(client);
  client.setQueryData<FeedbackPages>(adminKeys.feedbackList(query), (data) => {
    if (!data || data.pages.some((p) => p.items.some((i) => i.id === item.id)))
      return data;
    let placed = false;
    const pages = data.pages.map((p) => {
      if (placed) return p;
      const at = p.items.findIndex((i) => i.createdAt < item.createdAt);
      if (at === -1) return p;
      placed = true;
      return {
        ...p,
        items: [...p.items.slice(0, at), item, ...p.items.slice(at)],
      };
    });
    const last = pages.at(-1);
    if (!placed && last && last.cursor === null)
      pages[pages.length - 1] = { ...last, items: [...last.items, item] };
    return { ...data, pages };
  });
}

/**
 * Why an answer couldn't load, in words, or null: not while it's asked for
 * again (Try again), and not for an older page, which says so by its
 * "Show older".
 */
export function loadFailure(query: {
  isError: boolean;
  isFetching: boolean;
  error: unknown;
  isFetchNextPageError?: boolean;
}): string | null {
  if (!query.isError || query.isFetching || query.isFetchNextPageError)
    return null;
  return failureWords(query.error);
}
