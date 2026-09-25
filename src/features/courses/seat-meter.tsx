import { cn } from "cn";
import type { SectionKey } from "~/core/schema";
import {
  type SeatStatus,
  type SeatsMap,
  seatCounts,
  seatStatus,
} from "~/core/seats";

// Seats as a meter plus words (SPEC §3.4): "12 of 36 open", "2 left",
// "Full · 9 waitlisted". Color only says how close to full it is; the words
// carry the meaning.

const BAR: Record<SeatStatus["level"], string> = {
  open: "bg-fg/35",
  low: "bg-warn",
  full: "bg-error",
  unknown: "bg-transparent",
};

const WORDS: Record<SeatStatus["level"], string> = {
  open: "text-muted",
  low: "text-warn",
  full: "text-error",
  unknown: "text-faint",
};

export function SeatMeter({
  seats,
  sectionKey,
  meter = true,
  stacked = false,
  className,
}: {
  /** The seats file's map, or null before it loads. */
  seats: SeatsMap | null;
  sectionKey: SectionKey;
  /** False shows the words alone (tight rows). */
  meter?: boolean;
  /** Words over the meter, right-aligned: a list row's trail column. */
  stacked?: boolean;
  className?: string;
}) {
  const status = seatStatus(seatCounts(seats, sectionKey));
  return (
    <span
      className={cn(
        "inline-flex shrink-0",
        stacked ? "flex-col-reverse items-end gap-1" : "items-center gap-2",
        className,
      )}
      data-seat-level={status.level}
    >
      {meter && status.filled !== null ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-12 overflow-hidden rounded-full bg-hover"
        >
          <span
            className={cn("block h-full rounded-full", BAR[status.level])}
            style={{ width: `${Math.round(status.filled * 100)}%` }}
          />
        </span>
      ) : null}
      <span className={cn("tnum text-sm", WORDS[status.level])}>
        {status.words}
      </span>
    </span>
  );
}
