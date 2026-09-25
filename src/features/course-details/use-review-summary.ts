import { useEffect, useState } from "react";
import { track } from "~/app/analytics";
import type {
  CourseCode,
  InstructorSlug,
  ReviewSummary,
  ReviewSummaryResult,
} from "~/core/schema";
import { api } from "~/server/fns/api";

// The LLM review summary for an instructor (SPEC §3.4): generated on the
// first open, which takes a few seconds, then cached. Any "unavailable"
// answer, or any failure, hides it (SPEC §4): nothing else depends on it.

export type SummaryState =
  | { status: "loading" }
  | { status: "shown"; summary: ReviewSummary }
  | { status: "hidden" };

/** Wait this long before asking again when another request is generating it. */
export const BUSY_RETRY_MS = 4_000;

type Fetcher = typeof api.reviewSummary;

const settled = new Map<InstructorSlug, SummaryState>();
const inFlight = new Map<InstructorSlug, Promise<SummaryState>>();

async function load(
  slug: InstructorSlug,
  course: CourseCode,
  fetcher: Fetcher,
): Promise<SummaryState> {
  const ask = async (): Promise<ReviewSummaryResult | null> => {
    try {
      return await fetcher({ slug, course });
    } catch {
      return null;
    }
  };
  let result = await ask();
  if (result?.status === "unavailable" && result.reason === "busy") {
    // Someone else is generating it right now: once more, then give up.
    await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_MS));
    result = await ask();
  }
  const state: SummaryState =
    result?.status === "ok"
      ? { status: "shown", summary: result.summary }
      : { status: "hidden" };
  track("review_summary_viewed", {
    state: state.status === "shown" ? "shown" : "unavailable",
  });
  return state;
}

/** Loads once per instructor per visit, shared by every card that shows them. */
export function useReviewSummary(
  slug: InstructorSlug | null,
  course: CourseCode,
  { enabled = true, fetcher = api.reviewSummary } = {},
): SummaryState {
  const [state, setState] = useState<SummaryState>(
    () => (slug && settled.get(slug)) || { status: "loading" },
  );
  useEffect(() => {
    if (!slug || !enabled) return;
    const done = settled.get(slug);
    if (done) {
      setState(done);
      return;
    }
    let cancelled = false;
    let promise = inFlight.get(slug);
    if (!promise) {
      promise = load(slug, course, fetcher).then((s) => {
        settled.set(slug, s);
        inFlight.delete(slug);
        return s;
      });
      inFlight.set(slug, promise);
    }
    void promise.then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, course, enabled, fetcher]);
  if (!slug) return { status: "hidden" };
  return state;
}

/** Tests start from nothing cached. */
export function forgetReviewSummaries(): void {
  settled.clear();
  inFlight.clear();
}
