import { cn } from "cn";
import { Button } from "./button";
import { RELOAD_TOOLTIP, reloadPage } from "./reload";
import { WithTooltip } from "./tooltip";

// A failure, in place of what didn't load (docs/COHESION.md §3, Phase 2):
// one sentence that says what happened and what's next, and Try again where
// retrying can help. Never a banner, never red, never "reload" without a
// Reload button beside it (`reload`).

export function InlineError({
  message,
  onRetry,
  retryTooltip,
  retrying = false,
  reload = false,
  className,
}: {
  /** "ELMS didn't answer. We'll try again in 20 minutes." */
  message: string;
  onRetry?: () => void;
  /** What the button does, when it's more than loading this again. */
  retryTooltip?: string;
  /** Try again is on its way: "Trying…", and no second press. */
  retrying?: boolean;
  /**
   * Only a newer version of the page can help: the button is Reload, and it
   * loads the page again (`onRetry` is ignored).
   */
  reload?: boolean;
  className?: string;
}) {
  const action = reload ? () => reloadPage() : onRetry;
  return (
    <div
      role="status"
      className={cn("flex flex-col items-start gap-2 py-3", className)}
    >
      <p className="text-fg">{message}</p>
      {action ? (
        <WithTooltip
          label={retryTooltip ?? (reload ? RELOAD_TOOLTIP : "Load this again")}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={retrying}
            onClick={action}
          >
            {reload ? "Reload" : retrying ? "Trying…" : "Try again"}
          </Button>
        </WithTooltip>
      ) : null}
    </div>
  );
}
