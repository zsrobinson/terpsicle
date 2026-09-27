import { cn } from "cn";
import { Button } from "./button";
import { WithTooltip } from "./tooltip";

// A failure, in place of what didn't load (docs/COHESION.md §3, Phase 2):
// one sentence that says what happened and what's next, and Try again where
// retrying can help. Never a banner, never red, never "reload the page".

export function InlineError({
  message,
  onRetry,
  retryTooltip = "Load this again",
  className,
}: {
  /** "ELMS didn't answer. We'll try again in 20 minutes." */
  message: string;
  onRetry?: () => void;
  /** What Try again does, when it's more than loading this again. */
  retryTooltip?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn("flex flex-col items-start gap-2 py-3", className)}
    >
      <p className="text-fg">{message}</p>
      {onRetry ? (
        <WithTooltip label={retryTooltip}>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </WithTooltip>
      ) : null}
    </div>
  );
}
