import { cn } from "cn";
import { WithTooltip } from "~/ui/tooltip";

// "Early access" (the owner, 2026-09-28): a small chip beside the wordmark
// that says Terpsicle is still changing. The family bar shows it where
// there's room; the product menu always says it too, so it's there on
// phones.

export const EARLY_ACCESS = "Early access";
export const EARLY_ACCESS_NOTE =
  "Terpsicle's still in active development, so things may change.";

/**
 * The chip. Not a control: the tooltip is for a pointer, and a screen reader
 * reads the note with the words.
 */
export function EarlyAccessChip({ className }: { className?: string }) {
  return (
    <WithTooltip label={EARLY_ACCESS_NOTE} side="bottom">
      <span
        data-testid="early-access"
        className={cn(
          "inline-flex h-5 shrink-0 items-center whitespace-nowrap border border-hairline-strong px-1.5 font-medium text-2xs text-muted",
          className,
        )}
      >
        {EARLY_ACCESS}
        <span className="sr-only">: {EARLY_ACCESS_NOTE}</span>
      </span>
    </WithTooltip>
  );
}
