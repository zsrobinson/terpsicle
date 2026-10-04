import { type ReactNode, useMemo } from "react";
import type { SeatWatch, TermId } from "~/core/schema";
import { useSeatWatches } from "~/features/alerts/seat-watches";

// Your seat watches in a term, for Home's Schedule part. They're the app's
// one list (~/state/query/seat-watches), the one Schedule's bells and
// Settings change, so a watch started anywhere shows here at once. This
// loads on first use, signed in only: Home's first load carries no stores
// (scripts/check-bundle.ts).

/**
 * Renders `children` with the term's watches; null while they load or
 * can't (offline, the plan's line stands without them).
 */
export function WithSeatWatches({
  termId,
  children,
}: {
  termId: TermId;
  children: (watches: readonly SeatWatch[] | null) => ReactNode;
}) {
  const { data } = useSeatWatches();
  const watches = useMemo(
    () => data?.filter((w) => w.termId === termId) ?? null,
    [data, termId],
  );
  return children(watches);
}
