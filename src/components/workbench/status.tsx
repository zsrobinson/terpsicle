import { cn } from "cn";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { problemCountWords } from "~/core/problems/count-words";
import type { Severity } from "~/core/schema/problems";
import { TONE_FILL } from "~/lib/emphasis";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";

// A workbench's status in the family bar, the same in every product: where
// its data is (the sync slot), then its credits, then its problems, which
// open the Problems view (docs/COHESION.md §4, the bar's order).

/**
 * The sync slot's look: a ghost button, 28px, muted until hovered or open.
 * For a trigger that isn't `SyncSlot`'s own button (Todo's popover).
 */
export const SYNC_SLOT_CLASS =
  "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-muted text-sm transition-colors hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg";

/**
 * What the slot shows: a 15px glyph, then its word from 1280px. Narrower,
 * the word is for screen readers and the tooltip says it.
 */
export function SyncSlotFace({
  icon,
  word,
}: {
  icon: ReactNode;
  word: string;
}) {
  return (
    <>
      {icon}
      <span className="whitespace-nowrap max-xl:sr-only">{word}</span>
    </>
  );
}

/**
 * The family bar's sync slot, first in a workbench's status, the same in
 * Schedule, Plan and Todo: a glyph and a word, the whole sentence in its
 * tooltip. A cloud is your plans with your account (plan sync), a monitor
 * your plans in this browser, a calendar Todo's ELMS feed: different things
 * never share a glyph. Pressing it checks again now; without `onPress` it's
 * a status you can focus for its tooltip.
 */
export function SyncSlot({
  icon,
  word,
  tooltip,
  onPress,
  ...rest
}: {
  icon: ReactNode;
  word: string;
  tooltip: string;
  onPress?: () => void;
} & Omit<ComponentProps<"button">, "children" | "onClick">) {
  if (!onPress)
    return (
      <WithTooltip label={tooltip} side="bottom">
        <span
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the tooltip needs a focus stop
          tabIndex={0}
          role="status"
          {...(rest as ComponentProps<"span">)}
          className={cn(SYNC_SLOT_CLASS, "hover:bg-transparent")}
        >
          <SyncSlotFace icon={icon} word={word} />
        </span>
      </WithTooltip>
    );
  return (
    <WithTooltip label={tooltip} side="bottom">
      <button
        type="button"
        {...rest}
        onClick={onPress}
        className={SYNC_SLOT_CLASS}
      >
        <SyncSlotFace icon={icon} word={word} />
      </button>
    </WithTooltip>
  );
}

/** "16 credits", "62 of 120 credits": the number in ink, the rest muted. */
export function CreditsStatus({ label }: { label: string | null }) {
  if (!label) return null;
  const [number, ...rest] = label.split(" ");
  return (
    <span className="tnum text-base text-muted">
      <span className="font-medium text-fg">{number}</span> {rest.join(" ")}
    </span>
  );
}

/**
 * Calm by default (DESIGN §5): red only when there's an error, amber for
 * warnings alone, and quiet when there's nothing to fix. While the problems
 * are still being worked out, a neutral placeholder: "No problems" would be
 * a guess.
 */
export function ProblemsStatus({
  counts,
  checking = false,
  compact,
  shortcut,
  onOpen,
}: {
  counts: Record<Severity, number>;
  checking?: boolean;
  compact: boolean;
  /** The Problems view's shortcut, for the tooltip. */
  shortcut?: string;
  onOpen: () => void;
}) {
  if (checking)
    return (
      <WithTooltip label="Open Problems" shortcut={shortcut}>
        <button
          type="button"
          onClick={onOpen}
          aria-label="Checking for problems"
          className="flex h-7 items-center rounded-md px-2 hover:bg-hover"
        >
          <Skeleton
            data-testid="problems-checking"
            className={compact ? "h-3.5 w-3.5 rounded-full" : "h-3 w-[74px]"}
          />
        </button>
      </WithTooltip>
    );
  const n = counts.error + counts.warning;
  const tone =
    counts.error > 0 ? "error" : counts.warning > 0 ? "warning" : "none";
  const Icon =
    tone === "error"
      ? CircleAlert
      : tone === "warning"
        ? TriangleAlert
        : counts.info > 0
          ? Info
          : CircleCheck;
  // The same words as the Problems view: "2 problems · 1 note".
  const words = problemCountWords(counts);
  return (
    <WithTooltip
      label={n === 0 ? "Open Problems" : "See what needs attention"}
      shortcut={shortcut}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={words}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md px-2 text-base transition-colors",
          tone === "error" && TONE_FILL.error,
          tone === "warning" && TONE_FILL.warn,
          tone === "none" && "text-muted hover:bg-hover hover:text-fg",
        )}
      >
        <Icon size={14} aria-hidden="true" />
        <span className={cn("tnum", compact && n === 0 && "sr-only")}>
          {compact && n > 0 ? n : words}
        </span>
      </button>
    </WithTooltip>
  );
}
