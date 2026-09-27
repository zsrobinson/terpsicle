import { cn } from "cn";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { problemCountWords } from "~/core/problems/count-words";
import type { Severity } from "~/core/schema/problems";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { TONE_FILL } from "../emphasis";

// A workbench's status in the family bar, the same in every product: its
// credits, then its problems, which open the Problems view.

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
