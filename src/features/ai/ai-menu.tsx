import { cn } from "cn";
import { Ellipsis, EyeOff } from "lucide-react";
import { Button } from "~/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemText,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { setAiFeatures } from "./use-ai-features";

/** Every AI box's toast: one at a time, whichever box it came from. */
export const AI_TOAST_ID = "ai-features";

/** Hides every AI box at once, with Undo (no dialog: DESIGN.md §5). */
export function hideAiFeatures(): void {
  setAiFeatures(false, "box");
  undoToast({
    id: AI_TOAST_ID,
    message: "AI summaries are off",
    description: "Turn them back on in Settings.",
    tooltip: "Show AI summaries again",
    onUndo: () => setAiFeatures(true, "box"),
  });
}

/**
 * An AI box's ⋯ menu: "Hide AI summaries", for people who'd rather not see
 * them. It turns off every AI feature, everywhere; Settings turns them back
 * on (docs/decisions.md, "AI features can be turned off").
 */
export function AiMenu({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <WithTooltip label="AI summary options">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="AI summary options"
            // Beside the summary's first line, not below it.
            className={cn(
              "-my-1 data-[state=open]:bg-hover data-[state=open]:text-fg",
              className,
            )}
          >
            <Ellipsis size={14} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={hideAiFeatures}>
          <EyeOff aria-hidden="true" />
          <DropdownMenuItemText
            label="Hide AI summaries"
            hint="Everywhere. Settings turns them back on."
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
