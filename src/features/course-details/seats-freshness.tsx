import type { TermId } from "~/core/schema";
import {
  type SeatsFreshnessState,
  useSeatsFreshness,
} from "~/state/data-hooks";
import { WithTooltip } from "~/ui/tooltip";

const FRESHNESS_TIP: Record<SeatsFreshnessState, string> = {
  loading: "",
  live: "Seat counts come from Testudo every few minutes",
  offline: "You're offline: these are the last seat counts saved here",
  archived: "Past terms keep the seat counts they had at the end",
  unknown: "Testudo hasn't given seat counts for this term yet",
};

/** "Seats as of 2 min ago", from Testudo's own time when it gave one. */
export function SeatsFreshness({ termId }: { termId: TermId }) {
  const fresh = useSeatsFreshness(termId);
  if (!fresh.text) return null;
  return (
    <WithTooltip label={FRESHNESS_TIP[fresh.state]}>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-faint">
        {fresh.state === "live" ? (
          <span aria-hidden="true" className="size-1.5 rounded-full bg-ok" />
        ) : null}
        {fresh.text}
      </span>
    </WithTooltip>
  );
}
