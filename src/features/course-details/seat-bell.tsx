import { cn } from "cn";
import { Bell } from "lucide-react";
import { useState } from "react";
import type { SectionKey, TermId } from "~/core/schema";
import {
  rememberPendingWatch,
  stopWatching,
  useSeatWatch,
  watchSeat,
} from "~/features/alerts/seat-watches";
import { currentPath, GoogleButton } from "~/features/auth/sign-in-panel";
import { Button } from "~/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";

// Seat watch (SPEC §3.12, V2.md §6.5): "Watch for a seat" (a bell) on a low
// or full section, "Watching" (a filled bell) once it's on. Signed in, a
// click starts or stops it, with Undo in the toast. Signed out, it offers
// sign-in, and the watch starts when the person comes back. The same bell
// sits on the section row and, as a labelled button, in the full section's
// problem. Hidden while seat alerts are off.

export function SeatBell({
  termId,
  sectionKey,
  compact = false,
  full = true,
  variant = "icon",
}: {
  termId: TermId;
  sectionKey: SectionKey;
  /** Smaller, so compact rows keep one height with or without a bell. */
  compact?: boolean;
  /**
   * Full now. Alerts go out when a full section gets a seat back, so a low
   * section's bell says it'll email if the section fills and then reopens.
   */
  full?: boolean;
  /** `button`: the bell and its words ("Watch for a seat", "Watching"), for the problem's fix. */
  variant?: "icon" | "button";
}) {
  const state = useSeatWatch(termId, sectionKey);
  const [busy, setBusy] = useState(false);
  if (state.kind === "unavailable") return null;

  const label = sectionKey.replace("-", " ");
  const watching = state.kind === "watching";
  const tooltip = watching
    ? `Watching ${label}: we'll let you know when a seat opens. Click to stop.`
    : full
      ? "Watch for a seat: we'll let you know when one opens"
      : "Watch for a seat: we'll let you know if it fills and one opens again";
  const words = watching ? "Watching" : "Watch for a seat";

  const toggle = async () => {
    setBusy(true);
    if (watching) await stopWatching(termId, sectionKey);
    else await watchSeat(termId, sectionKey);
    setBusy(false);
  };
  // Signed out, the popover's trigger handles the click instead.
  const onClick = state.kind === "signed-out" ? undefined : () => void toggle();
  const trigger =
    variant === "button" ? (
      <Button
        variant="outline"
        size="row"
        data-alert={state.kind}
        aria-label={watching ? tooltip : `${words}, ${label}`}
        aria-pressed={state.kind === "signed-out" ? undefined : watching}
        disabled={busy}
        onClick={onClick}
      >
        <BellIcon filled={watching} />
        {words}
      </Button>
    ) : (
      <button
        type="button"
        // A list has many bells: each says which section it's for.
        aria-label={watching ? tooltip : `${tooltip}, ${label}`}
        aria-pressed={state.kind === "signed-out" ? undefined : watching}
        data-alert={state.kind}
        disabled={busy}
        onClick={onClick}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md transition-colors hover:bg-hover",
          compact ? "size-6" : "size-7",
          watching ? "text-fg" : "text-muted hover:text-fg",
        )}
      >
        <BellIcon filled={watching} />
      </button>
    );

  if (state.kind === "signed-out")
    return (
      <Popover>
        <WithTooltip label={tooltip}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        </WithTooltip>
        <PopoverContent
          className="w-72"
          side="bottom"
          align="end"
          aria-label={`Watch ${label} for a seat`}
        >
          <div className="font-medium text-base">
            {full ? (
              <>
                Find out when <span className="ident">{label}</span> has a seat
              </>
            ) : (
              <>
                Find out if <span className="ident">{label}</span> fills and a
                seat opens again
              </>
            )}
          </div>
          <p className="mt-1 mb-3 text-muted text-sm">
            Sign in to watch for a seat. You'll be watching as soon as you're
            back.
          </p>
          <GoogleButton
            returnTo={currentPath()}
            from="seat-watch"
            onStart={() => rememberPendingWatch(termId, sectionKey)}
          />
        </PopoverContent>
      </Popover>
    );

  return <WithTooltip label={tooltip}>{trigger}</WithTooltip>;
}

function BellIcon({ filled }: { filled: boolean }) {
  return (
    <Bell
      size={14}
      aria-hidden="true"
      // Watching is the filled bell.
      fill={filled ? "currentColor" : "none"}
    />
  );
}
