import { cn } from "cn";
import { Bell } from "lucide-react";
import { useState } from "react";
import type { SeatWatch, TermId } from "~/core/schema";
import { useSeatWatches } from "~/state/seat-watches";
import { WithTooltip } from "~/ui/tooltip";
import { courseHref, sectionLabel, termLabel } from "./labels";
import { stopWatching } from "./seat-watches";

// "Watching": the sections the signed-in person watches for a seat, in
// Settings (#watching, from the account menu) and in Export. Stop is
// immediate, with Undo in the toast: no dialog (DESIGN §5).

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/** "Since Sep 24" or "Last email Sep 25". */
function since(watch: SeatWatch): string {
  return watch.lastNotifiedAt
    ? `Last email ${DAY.format(new Date(watch.lastNotifiedAt))}`
    : `Since ${DAY.format(new Date(watch.createdAt))}`;
}

/**
 * The list itself; null until it has loaded. `termId`: the term on screen,
 * whose watches don't repeat its name.
 */
export function WatchingList({
  termId,
  className,
}: {
  termId?: TermId;
  className?: string;
}) {
  const watches = useSeatWatches((s) => s.watches);
  if (watches === null) return null;
  if (watches.length === 0)
    return (
      <p className={cn("text-muted text-sm", className)}>
        You're not watching any sections. On a full section, choose "Watch for a
        seat" and we'll email you when one opens.
      </p>
    );
  return (
    <ul className={cn("flex flex-col", className)}>
      {watches.map((watch) => (
        <WatchRow
          key={`${watch.termId}|${watch.sectionKey}`}
          watch={watch}
          showTerm={watch.termId !== termId}
        />
      ))}
    </ul>
  );
}

function WatchRow({
  watch,
  showTerm,
}: {
  watch: SeatWatch;
  showTerm: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const label = sectionLabel(watch.sectionKey);
  return (
    <li
      className="flex items-center gap-2 py-1.5"
      data-testid={`seat-watch-${watch.sectionKey}`}
    >
      <Bell
        size={13}
        fill="currentColor"
        className="shrink-0 text-fg"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <WithTooltip label={`Open ${label} in the scheduler`}>
            <a
              href={courseHref(watch.termId, watch.sectionKey)}
              className="ident font-semibold text-base text-fg hover:underline"
            >
              {label}
            </a>
          </WithTooltip>
          {showTerm ? (
            <span className="text-muted text-sm">
              {termLabel(watch.termId)}
            </span>
          ) : null}
        </div>
        <div className="text-muted text-sm">Watching · {since(watch)}</div>
      </div>
      <WithTooltip label={`Stop watching ${label}. You can undo this.`}>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void stopWatching(watch.termId, watch.sectionKey).finally(() =>
              setBusy(false),
            );
          }}
          className="shrink-0 rounded px-1.5 py-0.5 text-muted text-sm transition-colors hover:bg-hover hover:text-fg"
        >
          Stop
        </button>
      </WithTooltip>
    </li>
  );
}
